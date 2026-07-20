import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class VNPayClientService {
  /**
   * Sorts object keys alphabetically, as required by VNPay IPN checksum specification.
   */
  private sortObject(obj: Record<string, unknown>): Record<string, string> {
    const sorted: Record<string, string> = {};
    const keys = Object.keys(obj).sort();

    for (const key of keys) {
      const val = obj[key];
      if (val !== undefined && val !== null && val !== '') {
        let strVal = '';
        if (
          typeof val === 'string' ||
          typeof val === 'number' ||
          typeof val === 'boolean'
        ) {
          strVal = String(val);
        } else if (typeof val === 'object') {
          strVal = JSON.stringify(val);
        }
        sorted[key] = encodeURIComponent(strVal).replace(/%20/g, '+');
      }
    }
    return sorted;
  }

  /**
   * Verifies the VNPay IPN signature using HMAC SHA256.
   */
  verifyIpnSignature(queryParams: Record<string, unknown>): boolean {
    const vnpSecureHash = queryParams['vnp_SecureHash'];
    if (!vnpSecureHash || typeof vnpSecureHash !== 'string') {
      return false;
    }

    const secretKey = process.env.VNP_HASH_SECRET || 'VNPAYSECRETKEYDUMMY';

    // Clone params without secure hash fields
    const paramsToSign: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(queryParams)) {
      if (key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType') {
        paramsToSign[key] = value;
      }
    }

    const sortedParams = this.sortObject(paramsToSign);
    const signData = Object.entries(sortedParams)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    const hmac = crypto.createHmac('sha256', secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    return signed.toLowerCase() === vnpSecureHash.toLowerCase();
  }
}
