import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrintQuoteService } from './print-quote.service';
import { CreateQuoteDto } from './dto/print.dto';
import { Public } from '../common/decorators/public.decorator';
import { StatusTokenGuard } from '../common/guards/status-token.guard';
import { StatusToken } from '../common/decorators/status-token.decorator';
import { StatusTokenClaims } from '../common/types/request-context';

@Controller('print/quote')
export class PrintQuoteController {
  constructor(private readonly quoteService: PrintQuoteService) {}

  @Public()
  @UseGuards(StatusTokenGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  create(@Body() dto: CreateQuoteDto, @StatusToken() claims: StatusTokenClaims) {
    return this.quoteService.createQuote(dto, claims);
  }
}
