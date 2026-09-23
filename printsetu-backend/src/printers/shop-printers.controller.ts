import { Body, Controller, Delete, Get, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrintersService } from './printers.service';
import { AgentPackageService } from './agent-package.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { ShopAccessDeniedException } from '../common/exceptions/app.exceptions';
import { DownloadAgentPackageDto, SelectOsPrinterDto } from './dto/printer.dto';

/**
 * Shop-side self-serve counterpart to POST /api/agent/register (admin-only,
 * SRS §17). Lets a shopkeeper download a ready-to-run Print Agent for their
 * own PC without an admin having to hand them a credential out-of-band.
 */
@Controller('shop/printers')
@Roles('SHOPKEEPER')
export class ShopPrintersController {
  constructor(
    private readonly printersService: PrintersService,
    private readonly agentPackageService: AgentPackageService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');
    const printers = await this.printersService.listForShop(user.shopId);
    // Never send agentKeyHash to the browser — it's not a secret an
    // attacker could use directly, but there's no reason to expose it.
    return printers.map(({ agentKeyHash: _agentKeyHash, ...printer }) => printer);
  }

  /**
   * Issues a brand-new agent credential for this shop and streams back an
   * archive containing the packaged agent + that OS's service installer
   * (Windows ZIP by default, Linux tar.gz for `os: 'linux'`) with that
   * credential already baked in. Each call registers a fresh printer
   * row (mirrors admin registration) — reinstalling on a new PC is just
   * "download again", no revoke step needed since old credentials simply
   * go unused.
   */
  @Post('agent-package')
  async downloadAgentPackage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DownloadAgentPackageDto,
    @Res() res: Response,
  ) {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');
    const os = dto.os ?? 'windows';

    // Fail before registering a printer row if this server has no bundle
    // for that OS — otherwise every failed click leaves a dead "Print
    // Agent" row behind on the shop's printer list.
    this.agentPackageService.assertBundleAvailable(os);

    const { agentId, agentSecret } = await this.printersService.register({
      shopId: user.shopId,
      printerName: os === 'linux' ? 'Print Agent (Linux)' : 'Print Agent',
      driverName: os === 'linux' ? 'cups' : 'windows',
    });

    const pkg = await this.agentPackageService.buildPackage(os, { agentId, agentSecret });

    res.set({
      'Content-Type': pkg.contentType,
      'Content-Disposition': `attachment; filename="${pkg.fileName}"`,
      'Content-Length': pkg.data.length,
    });
    res.send(pkg.data);
  }

  /** Chooses which printer on the agent's computer receives jobs; `osPrinterName: null` = that computer's default printer. */
  @Patch(':id')
  async selectOsPrinter(
    @Param('id') id: string,
    @Body() dto: SelectOsPrinterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');
    const { agentKeyHash: _agentKeyHash, ...printer } = await this.printersService.selectOsPrinter(
      user.shopId,
      id,
      dto.osPrinterName,
    );
    return printer;
  }

  /** Asks a connected agent to re-scan its computer's printers right away (e.g. one was just plugged in). */
  @Post(':id/refresh-printers')
  refreshPrinters(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');
    return this.printersService.requestPrinterRefresh(user.shopId, id);
  }

  /** Self-serve unlink of one of this shop's own printers/agents (e.g. a replaced or decommissioned PC). */
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');
    await this.printersService.remove(id, user.shopId);
    return { removed: true };
  }
}
