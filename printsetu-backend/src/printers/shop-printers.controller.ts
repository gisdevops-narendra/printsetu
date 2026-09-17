import { Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrintersService } from './printers.service';
import { AgentPackageService } from './agent-package.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { ShopAccessDeniedException } from '../common/exceptions/app.exceptions';

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
   * Issues a brand-new agent credential for this shop and streams back a
   * ZIP containing the packaged agent exe + Windows service installer with
   * that credential already baked in. Each call registers a fresh printer
   * row (mirrors admin registration) — reinstalling on a new PC is just
   * "download again", no revoke step needed since old credentials simply
   * go unused.
   */
  @Post('agent-package')
  async downloadAgentPackage(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    if (!user.shopId) throw new ShopAccessDeniedException('No shop assigned to this account.');

    const printerName = 'Print Agent';
    const { agentId, agentSecret } = await this.printersService.register({
      shopId: user.shopId,
      printerName,
      driverName: 'auto',
    });

    const zip = await this.agentPackageService.buildZip({ agentId, agentSecret, printerName });

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="PrintSetu-Print-Agent.zip"',
      'Content-Length': zip.length,
    });
    res.send(zip);
  }
}
