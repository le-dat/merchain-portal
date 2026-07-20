import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Public } from '../../../auth/decorators/public.decorator';
import { VNPayClientService } from '../../infrastructure/gateways/vnpay.client';
import { ProcessWebhookHandler } from '../../application/commands/handlers/process-webhook.handler';
import { ProcessWebhookCommand } from '../../application/commands/impl/process-webhook.command';

export interface VNPayIpnResponse {
  RspCode: string;
  Message: string;
}

@Controller('webhooks')
export class VNPayIpnController {
  private readonly logger = new Logger(VNPayIpnController.name);

  constructor(
    private readonly vnpayClient: VNPayClientService,
    private readonly handler: ProcessWebhookHandler,
  ) {}

  @Public()
  @Get('vnpay/ipn')
  @HttpCode(HttpStatus.OK)
  async handleIpn(
    @Query() query: Record<string, unknown>,
  ): Promise<VNPayIpnResponse> {
    this.logger.log(`Received VNPay IPN request`);

    // 1. Verify Checksum
    const isValid = this.vnpayClient.verifyIpnSignature(query);
    if (!isValid) {
      this.logger.warn('VNPay IPN invalid checksum');
      return { RspCode: '97', Message: 'Invalid Checksum' };
    }

    const txnCode = query['vnp_TransactionNo'] as string;
    const orderCode = query['vnp_TxnRef'] as string;
    const amountRaw = parseFloat(query['vnp_Amount'] as string) || 0;
    const amount = amountRaw / 100; // VNPay amounts are multiplied by 100
    const responseCode = query['vnp_ResponseCode'] as string;
    const payDateStr = query['vnp_PayDate'] as string;

    // Parse YYYYMMDDHHmmss string to Date
    let bankTimestamp = new Date();
    if (payDateStr && payDateStr.length === 14) {
      const year = parseInt(payDateStr.substring(0, 4), 10);
      const month = parseInt(payDateStr.substring(4, 6), 10) - 1;
      const day = parseInt(payDateStr.substring(6, 8), 10);
      const hour = parseInt(payDateStr.substring(8, 10), 10);
      const minute = parseInt(payDateStr.substring(10, 12), 10);
      const second = parseInt(payDateStr.substring(12, 14), 10);
      bankTimestamp = new Date(
        Date.UTC(year, month, day, hour - 7, minute, second),
      ); // UTC offset for ICT (UTC+7)
    }

    const status = responseCode === '00' ? 'SUCCESS' : 'FAILED';

    try {
      const result = await this.handler.execute(
        new ProcessWebhookCommand(
          'vnpay',
          txnCode,
          'PAYMENT',
          amount,
          'VND',
          status,
          bankTimestamp,
          query,
          0,
          undefined,
          orderCode,
        ),
      );

      this.logger.log(`VNPay IPN process result: ${result.status}`);
      return { RspCode: '00', Message: 'Confirm Success' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error processing VNPay IPN: ${msg}`);
      return { RspCode: '99', Message: 'Unknown Error' };
    }
  }
}
