import {
  Controller,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { MatchPayoutHandler } from '../../application/commands/handlers/match-payout.handler';
import { MatchPayoutCommand } from '../../application/commands/impl/match-payout.command';

@Controller('reconciliations/payouts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayoutController {
  private readonly logger = new Logger(PayoutController.name);

  constructor(private readonly matchPayoutHandler: MatchPayoutHandler) {}

  @Post(':bankStatementId/match')
  @HttpCode(HttpStatus.OK)
  @Roles('ACCOUNTANT', 'ADMIN')
  async matchPayout(@Param('bankStatementId') bankStatementId: string) {
    this.logger.log(
      `Payout match requested for bank statement: ${bankStatementId}`,
    );
    return this.matchPayoutHandler.execute(
      new MatchPayoutCommand(bankStatementId),
    );
  }
}
