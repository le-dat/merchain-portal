# Merchain Portal - Hệ thống Đối soát Giao dịch Tự động (Stripe & VNPay)

Hệ thống đối soát giao dịch tự động tích hợp sâu với hai cổng thanh toán: **Stripe** (quốc tế) và **VNPay** (nội địa). Hệ thống xử lý song song hai cơ chế: Webhook thời gian thực (Real-time Webhook/IPN) và Đối soát file sao kê định kỳ (CSV/Excel Payouts/Settlements).

## 1. Bài toán & Nỗi đau Đối soát Thực tế

- **Khấu trừ phí cổng thanh toán (Processing Fees):**
  - **Stripe**: Khấu trừ phí trực tiếp trên từng giao dịch.
  - **VNPay**: Áp dụng biểu phí khác nhau giữa thẻ ATM nội địa và thẻ quốc tế. Phí thanh toán gộp trừ cuối kỳ.
  - _Nỗi đau_: Kế toán đối chiếu số tiền thực nhận luôn bị lệch so với giá trị đơn hàng gốc.
- **Hoàn tiền (Refunds) & Tranh chấp (Disputes/Chargebacks):**
  - Khách hàng yêu cầu hoàn tiền hoặc kiện lên ngân hàng đòi hủy giao dịch. Cổng thanh toán trừ tiền ngược lại kèm phí phạt tranh chấp (Dispute Fee).
  - _Nỗi đau_: Gây lệch tổng doanh thu thực tế, kế toán khó đối chiếu giao dịch gốc đã bị hoàn/phạt.
- **Biến động tỷ giá & Chênh lệch ngoại hối (FX Rate & Gain/Loss):**
  - Doanh nghiệp bán hàng bằng ngoại tệ (USD) nhưng nhận tiền payout về tài khoản ngân hàng nội địa bằng VND. Tỷ giá tại thời điểm thanh toán khác tỷ giá thực tế lúc tiền về ngân hàng.
  - _Nỗi đau_: Tạo ra các khoản chênh lệch tỷ giá (lãi/lỗ tỷ giá) cần hạch toán tài chính chính xác.
- **Tiền đang đi đường & Đối soát tài khoản Ngân hàng (Cash in Transit & Bank Statement):**
  - Giao dịch thanh toán thành công (Webhook khớp) nhưng tiền vẫn nằm ở Stripe/VNPay dưới dạng "tiền đang đi đường". Phải đến khi có đợt chuyển tiền gom (Payout) về tài khoản ngân hàng doanh nghiệp thì tiền mới thực sự nổi.
  - _Nỗi đau_: Khó theo dõi số dư thực tế đang bị giam trên các cổng và đối chiếu khớp lệnh Payout với sao kê ngân hàng thô.
- **Nghẽn tải file đối soát cuối ngày/tuần:**
  - File sao kê đối soát từ cổng chứa **5,000 - 10,000 dòng giao dịch**. Xử lý file này đồng bộ sẽ gây đơ/treo server NestJS.
- **Xác thực và Bảo mật (Signature & Secure Hash):**
  - Rủi ro webhook giả mạo báo có tiền từ hacker. Cần xác thực chữ ký số tuyệt đối trước khi xử lý.

## 2. Kiến trúc Hệ thống (Option A - Monolith NestJS + BullMQ + PostgreSQL Optimized)

Hệ thống được xây dựng bằng **NestJS** và **PostgreSQL (sử dụng JSONB)** để lưu trữ và truy vấn linh hoạt dữ liệu không đồng nhất từ hai cổng thanh toán mà không cần MongoDB. Để đảm bảo hiệu năng và tính toàn vẹn dữ liệu ở quy mô lớn, kiến trúc được tối ưu hóa như sau:

- **PostgreSQL**: Đảm bảo ACID cho các bảng `orders` và `transactions`. Cột `raw_payload` kiểu `JSONB` sử dụng `jsonb_path_ops` index để tối ưu hóa truy vấn trường con mà không làm giảm hiệu năng ghi.
- **BullMQ + Redis**: Xử lý hàng đợi bất đồng bộ các job import file đối soát. Dữ liệu được chia nhỏ thành các batch 500 dòng thông qua luồng Stream Reader (ví dụ: `csv-parser` hoặc `exceljs` sax-mode) để giữ mức RAM luôn dưới 512MB.
- **Distributed Locking (Redlock via Redis)**: Cơ chế khóa phân tán ngăn chặn hiện tượng tranh chấp (Race Condition) khi webhook real-time và batch job đối soát file cùng xử lý một đơn hàng tại một thời điểm.

## 3. Quy trình Đối soát Chi tiết (Stripe & VNPay)

### A. Kênh Stripe

1. **Real-time Webhook:**
   - **Thanh toán thành công:** Lắng nghe event `charge.succeeded` hoặc `payment_intent.succeeded`. Xác thực signature, trích xuất `metadata.order_id`, tính toán phí cổng, và khớp đơn hàng (Order status: `COMPLETED`, Transaction status: `MATCHED`, Payout status: `PENDING_PAYOUT`).
   - **Hoàn tiền:** Lắng nghe event `charge.refunded`. Trích xuất mã giao dịch gốc, tạo dòng giao dịch mới loại `REFUND` liên kết với giao dịch gốc, cập nhật trạng thái đơn hàng thành `REFUNDED` hoặc `PARTIALLY_REFUNDED`.
   - **Tranh chấp:** Lắng nghe event `charge.dispute.created`. Tạo dòng giao dịch loại `DISPUTE`, trừ tiền giao dịch và áp phí phạt tranh chấp (e.g. $15), cập nhật đơn hàng thành `DISPUTED`.
2. **Batch Payout Reconciliation (File CSV):**
   - Kế toán upload file Stripe Payout Report (CSV) chứa thông tin gom các giao dịch đã chuyển khoản về ngân hàng.
   - BullMQ Worker phân tích file, gom nhóm các transaction tương ứng gắn với `payout_id`, tính chênh lệch tỷ giá quy đổi thực tế so với tỷ giá dự kiến (nếu payout bằng VND từ thẻ USD). Cập nhật trạng thái Payout nội bộ thành `TRANSIT`.

### B. Kênh VNPay

1. **Real-time IPN (Instant Payment Notification):**
   - **Thanh toán thành công:** Nhận callback IPN từ VNPay, verify chữ ký số, khớp đơn hàng bằng `vnp_TxnRef`. Chuyển trạng thái đơn sang `COMPLETED`, ghi nhận giao dịch gốc với `processing_fee` tạm tính = 0.
   - **Hoàn tiền:** Nhận callback IPN hoàn tiền từ hệ thống VNPay. Tạo giao dịch loại `REFUND` liên kết với giao dịch thanh toán gốc, chuyển trạng thái đơn hàng tương ứng sang hoàn tiền.
2. **Batch Settlement Reconciliation (File đối soát định kỳ):**
   - VNPay gửi file đối soát định kỳ chứa chi tiết phí của từng giao dịch.
   - BullMQ Worker đọc file, tính toán và điền ngược lại `processing_fee` thực tế cho các giao dịch trong DB, tính số tiền thực nhận `net_amount` và liên kết với một phiên `payout_id`.

### C. Đối soát Tài khoản Ngân hàng (Bank Statement Reconciliation)
- Kế toán upload file sao kê tài khoản ngân hàng của công ty (dạng CSV từ Techcombank, Vietcombank,...).
- Hệ thống thực hiện khớp dòng tiền thô trong ngân hàng với các đợt Payout (`payouts`) của Stripe/VNPay:
  - Nếu số tiền thực nhận trong tài khoản ngân hàng khớp 100% với số tiền Payout từ cổng thanh toán -> Cập nhật trạng thái Payout thành `SETTLED`.
  - Toàn bộ giao dịch thuộc Payout đó chuyển từ trạng thái "Tiền đang đi đường" sang `SETTLED` (Tiền thực tế đã nổi tài khoản).

## 4. Thiết kế Database (PostgreSQL Schema)

```sql
-- Bảng Đơn hàng (Orders)
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL, -- Ví dụ: DH100234
    amount DECIMAL(15, 2) NOT NULL, -- Số tiền gốc của đơn hàng
    currency VARCHAR(3) NOT NULL DEFAULT 'VND', -- Đơn vị tiền tệ (VND, USD,...)
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETED, CANCELLED, REFUNDED, PARTIALLY_REFUNDED, DISPUTED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bảng Sao kê ngân hàng thực tế (Bank Statements)
CREATE TABLE bank_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_no VARCHAR(100) UNIQUE NOT NULL, -- Mã giao dịch của Ngân hàng (ví dụ: FT260717...)
    amount DECIMAL(15, 2) NOT NULL, -- Số tiền giao dịch thực nhận
    currency VARCHAR(3) NOT NULL DEFAULT 'VND',
    bank_timestamp TIMESTAMP WITH TIME ZONE NOT NULL, -- Thời gian tiền nổi tài khoản ngân hàng
    description TEXT NOT NULL, -- Nội dung chuyển khoản thô (để phân tích tìm mã Payout)
    status VARCHAR(30) NOT NULL DEFAULT 'UNMATCHED', -- 'UNMATCHED', 'MATCHED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bảng Đợt chuyển tiền gom từ cổng thanh toán về ngân hàng (Payouts)
CREATE TABLE payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_code VARCHAR(100) UNIQUE NOT NULL, -- Stripe Payout ID (po_...) hoặc VNPay Settlement Batch ID
    gateway VARCHAR(50) NOT NULL, -- 'STRIPE', 'VNPAY'
    amount DECIMAL(15, 2) NOT NULL, -- Tổng số tiền gom thực tế chuyển về ngân hàng
    currency VARCHAR(3) NOT NULL DEFAULT 'VND', -- Loại tiền nhận về ngân hàng (thường là VND)
    processing_fee DECIMAL(15, 2) DEFAULT 0.00, -- Phí gộp thu thêm từ đợt chuyển khoản (nếu có)
    bank_account_no VARCHAR(50) NOT NULL, -- Số tài khoản nhận tiền của doanh nghiệp
    status VARCHAR(30) NOT NULL DEFAULT 'TRANSIT', -- 'TRANSIT' (Tiền đang đi đường), 'SETTLED' (Đã nổi tài khoản)
    bank_statement_id UUID REFERENCES bank_statements(id) NULL, -- Khớp sang dòng sao kê ngân hàng
    bank_timestamp TIMESTAMP WITH TIME ZONE NULL, -- Ngày thực tế tiền vào ngân hàng
    raw_payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bảng Lịch sử giao dịch đối soát (Transactions)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_code VARCHAR(100) NOT NULL, -- Stripe PaymentIntent ID, VNPay TransactionNo, Stripe Refund ID,...
    gateway VARCHAR(50) NOT NULL, -- 'STRIPE', 'VNPAY'
    type VARCHAR(30) NOT NULL DEFAULT 'PAYMENT', -- 'PAYMENT' (Thanh toán), 'REFUND' (Hoàn tiền), 'DISPUTE' (Tranh chấp)
    amount DECIMAL(15, 2) NOT NULL, -- Số tiền giao dịch thô (dương đối với PAYMENT, âm đối với REFUND/DISPUTE)
    currency VARCHAR(3) NOT NULL DEFAULT 'VND', -- Đơn vị tiền tệ gốc của giao dịch
    processing_fee DECIMAL(15, 2) DEFAULT 0.00, -- Phí cổng khấu trừ trên giao dịch này
    net_amount DECIMAL(15, 2) NOT NULL, -- Số tiền thực nhận sau phí (amount - processing_fee)
    
    -- Xử lý tỷ giá & chênh lệch ngoại hối (FX)
    exchange_rate DECIMAL(15, 6) DEFAULT 1.000000, -- Tỷ giá quy đổi thực tế sang VND tại thời điểm Payout
    fx_gain_loss DECIMAL(15, 2) DEFAULT 0.00, -- Chênh lệch tỷ giá hạch toán (lãi/lỗ tỷ giá)

    bank_timestamp TIMESTAMP WITH TIME ZONE NOT NULL, -- Thời gian cổng thanh toán ghi nhận giao dịch
    status VARCHAR(30) NOT NULL, -- 'MATCHED', 'UNMATCHED', 'PARTIAL_MATCH', 'SUSPICIOUS_MATCH', 'SETTLED'
    
    order_id UUID REFERENCES orders(id) NULL, -- Khớp sang đơn hàng
    parent_transaction_id UUID REFERENCES transactions(id) NULL, -- Liên kết REFUND/DISPUTE với giao dịch PAYMENT gốc
    payout_id UUID REFERENCES payouts(id) NULL, -- Liên kết với đợt chuyển tiền gom của cổng thanh toán

    raw_payload JSONB NOT NULL, -- Object gốc để audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_transaction_gateway_type UNIQUE (transaction_code, gateway, type)
);

-- INDEX TỐI ƯU HÓA TRUY VẤN ĐỐI SOÁT
CREATE INDEX idx_orders_code ON orders(code);
CREATE INDEX idx_transactions_code_gateway ON transactions(transaction_code, gateway);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_payout_id ON transactions(payout_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_bank_statements_status ON bank_statements(status);
-- Tối ưu hóa GIN index sử dụng jsonb_path_ops
CREATE INDEX idx_transactions_raw_payload ON transactions USING gin (raw_payload jsonb_path_ops);
```

## 5. Thuật toán Đối soát Đặc thù (Stripe & VNPay Matching Rules)

- **Ngăn chặn Race Condition & Đảm bảo Tính nhất quán:**
  - Trước khi tiến hành đối soát một giao dịch với đơn hàng, hệ thống bắt buộc phải acquire một Lock thông qua **Redlock** sử dụng key dạng `lock:order:<code>`.
  - Lock này chỉ được giải phóng sau khi đơn hàng được cập nhật trạng thái (`COMPLETED`/`PARTIAL_MATCH`...) và giao dịch được lưu xuống database thành công.
- **Quy tắc khớp mã đơn:** Quét metadata của Stripe (`metadata.order_id`) hoặc `vnp_TxnRef` của VNPay. Nếu không tìm thấy (ví dụ: đối soát sao kê ngân hàng thủ công), hệ thống sẽ quét chuỗi text trong mô tả chuyển khoản bằng regex để tìm mã đơn hàng.
- **Đối soát đa tiền tệ (Currency Matching):**
  - Hệ thống kiểm tra tính khớp của trường `currency` giữa Đơn hàng (`orders.currency`) và Giao dịch thực tế (`transactions.currency`). Trường hợp khác tiền tệ, hệ thống sẽ flag `UNMATCHED` và yêu cầu kế toán đối chiếu tỷ giá thủ công.
- **Quy tắc lệch tiền & Khấu trừ phí (Fee Handling):**
  - **Stripe**: Nếu giao dịch bằng USD, hệ thống tự động kiểm tra số tiền thực nhận có bằng `Order_Amount - (Order_Amount * 2.9% + 0.3 USD)` (hoặc biểu phí tương ứng cấu hình trong Settings) hay không. Nếu khớp -> Khớp tự động `MATCHED` và đổi trạng thái đơn hàng sang `COMPLETED`.
  - **VNPay**: Do VNPay IPN trả về số tiền gốc (phí giao dịch thanh toán gộp trừ cuối kỳ), nếu số tiền khớp 100% trên IPN -> Khớp tự động `MATCHED`. Khi import file đối soát hàng ngày từ VNPay, BullMQ Worker sẽ cập nhật giá trị `processing_fee` và `net_amount` của giao dịch tương ứng dựa trên sao kê chi tiết mà không làm thay đổi trạng thái `COMPLETED` của đơn hàng đã khớp trước đó.
- **Đối soát Hoàn tiền (Refunds) & Tranh chấp (Disputes):**
  - **Refund**: Khi có giao dịch hoàn tiền, hệ thống lấy mã giao dịch gốc từ `parent_transaction_id`. Nếu số tiền hoàn khớp hoàn toàn -> Cập nhật `orders.status` thành `REFUNDED`. Nếu hoàn một phần -> Đổi thành `PARTIALLY_REFUNDED`. Phí giao dịch Stripe gốc không được hoàn lại, do đó phí hoàn tiền vẫn được cộng dồn vào chi phí tài chính của hệ thống.
  - **Dispute/Chargeback**: Khi có tranh chấp từ ngân hàng của khách, hệ thống tạo một giao dịch loại `DISPUTE` với số tiền âm, tự động áp phí phạt tranh chấp (e.g. 15 USD của Stripe) cộng vào `processing_fee`, đổi trạng thái đơn hàng sang `DISPUTED`. Khi tranh chấp thắng kiện (Dispute Reversal), tạo giao dịch `DISPUTE_REVERSAL` để hoàn trả tiền và phí phạt, đưa đơn hàng về `COMPLETED`.
- **Hạch toán Chênh lệch Tỷ giá ngoại hối (FX Gain/Loss Calculation):**
  - Khi đợt Payout của Stripe gửi tiền về ngân hàng Việt Nam bằng VND cho đơn hàng gốc USD:
    - *Tỷ giá sổ sách dự kiến:* Tỷ giá tại ngày thanh toán đơn hàng (ví dụ: 1 USD = 25,000 VND).
    - *Tỷ giá thực tế nhận:* Tỷ giá ngân hàng quy đổi ghi nhận trong file Payout (ví dụ: 1 USD = 25,100 VND).
    - *Công thức tính lãi/lỗ tỷ giá:* `fx_gain_loss = net_amount_actual_vnd - (net_amount_usd * expected_exchange_rate)`. Giá trị dương được ghi vào Doanh thu chênh lệch tỷ giá, giá trị âm ghi vào Chi phí chênh lệch tỷ giá.
- **Quy trình giải phóng "Tiền đang đi đường" (Cash in Transit to Bank):**
  - **B1:** Giao dịch thanh toán được ghi nhận -> Trạng thái: `MATCHED` (Tiền treo trên cổng Stripe/VNPay - Tiền đang đi đường).
  - **B2:** Đọc file báo cáo Payout -> Tạo bản ghi `payouts` với trạng thái `TRANSIT` (Tiền đang được cổng chuyển về ngân hàng). Liên kết toàn bộ transactions trong đợt đó với `payout_id`.
  - **B3:** Import file sao kê ngân hàng công ty -> Sử dụng thuật toán khớp thông tin (so khớp số tiền Payout và tìm mã `payout_code` bằng Regex trong cột nội dung sao kê).
  - **B4:** Khớp thành công -> Bản ghi Payout chuyển sang `SETTLED`. Đồng loạt cập nhật trạng thái toàn bộ transactions liên kết thành `SETTLED` (Hạch toán dòng tiền chính thức kết thúc, tiền đã nằm trong két của doanh nghiệp).
- **Ngưỡng sai lệch (Thresholds):**
  - Đối với các sai lệch tiền nhỏ do sai số làm tròn hoặc cấu hình phí lệch nhẹ, hệ thống áp dụng ngưỡng sai lệch tuyệt đối tối đa (ví dụ: ±10,000 VND hoặc ±0.5 USD - có thể cấu hình) thay vì tỷ lệ % cố định để tránh thất thoát lớn với các đơn hàng giá trị cao. Các giao dịch trong ngưỡng này được flag là `PARTIAL_MATCH`.

## 6. Xác thực & Phân quyền (Authentication & Authorization)

Hệ thống sử dụng cơ chế xác thực JWT và phân quyền theo vai trò (RBAC) để đảm bảo an toàn thông tin tài chính.

### A. Phương thức Xác thực (Authentication)
- **JWT Flow:** Sử dụng cơ chế Access Token (hạn 15 phút, lưu ở memory/Client state) và Refresh Token (hạn 7 ngày, lưu ở HttpOnly Cookie để tránh tấn công XSS).
- **Mã hóa mật khẩu:** Sử dụng `bcrypt` hoặc `argon2` để băm mật khẩu của người dùng trước khi lưu vào database.

### B. Phân quyền Người dùng (Authorization - RBAC)
Hệ thống định nghĩa hai vai trò cơ bản:
- **`ADMIN` (Quản trị viên):** 
  - Toàn quyền quản trị tài khoản người dùng (Kế toán).
  - Cấu hình hệ thống (API Key, Webhook Secret của Stripe/VNPay).
  - Xem toàn bộ hệ thống Audit Logs.
- **`ACCOUNTANT` (Kế toán):**
  - Xem dashboard, danh sách đơn hàng và giao dịch.
  - Tải lên (Import) file sao kê đối soát (CSV/Excel).
  - Thực hiện khớp thủ công các giao dịch lệch (`PARTIAL_MATCH`, `SUSPICIOUS_MATCH`, `UNMATCHED`).
  - Xuất báo cáo tài chính cuối tháng.

### C. Ma trận Phân quyền Endpoint (Endpoint Security Matrix)

| Endpoint | Quyền truy cập | Cơ chế bảo vệ |
| :--- | :--- | :--- |
| `POST /api/auth/login` | Public | Không |
| `POST /api/auth/refresh` | Public | Đọc Refresh Token từ HttpOnly Cookie |
| `POST /api/webhooks/stripe` | Public | Verify `stripe-signature` + IP Whitelist |
| `POST /api/webhooks/vnpay/ipn` | Public | Verify `vnp_SecureHash` + IP Whitelist (VNPay IP Range) |
| `GET/POST /api/reconciliation/*` | `ACCOUNTANT`, `ADMIN` | JWT Auth Guard + Roles Guard |
| `GET /api/dashboard/*` | `ACCOUNTANT`, `ADMIN` | JWT Auth Guard + Roles Guard |
| `ALL /api/users/*` | `ADMIN` | JWT Auth Guard + Roles Guard (chỉ Admin) |
| `ALL /api/settings/*` | `ADMIN` | JWT Auth Guard + Roles Guard (chỉ Admin) |

---

## 7. Tích hợp DevOps, Gateway & Tracking

### A. Cấu hình API Gateway (Nginx / Cloudflare)
- **IP Whitelisting:** Chỉ cho phép dải IP chính thức của VNPay gọi vào endpoint `/api/webhooks/vnpay/ipn` ở tầng Gateway.
- **Rate Limiting:** Giới hạn tần suất gọi webhook (e.g. tối đa 100 requests/phút trên mỗi IP) để ngăn chặn spam/DDoS.
- **TLS Termination:** Bắt buộc toàn bộ kết nối webhook đi qua HTTPS bảo mật (TLS 1.2 / 1.3).

### B. Hệ thống Giám sát & Theo dõi (Observability & Tracking)
- **Giám sát hàng đợi (Queue Monitoring):**
  - Tích hợp **Bull Board** (`@bull-board/nestjs`) làm trang quản trị quản lý trực quan trạng thái Job (Active, Completed, Failed), hỗ trợ retry thủ công các job lỗi.
  - Sử dụng **Prometheus** thu thập chỉ số hàng đợi (độ trễ, kích thước queue) và hiển thị trực quan qua **Grafana**.
- **Giám sát lỗi ứng dụng (Error Tracking):**
  - Tích hợp **Sentry SDK** để tự động chụp (capture) exception từ controller và worker, gửi cảnh báo tức thì về Slack/Telegram.
- **Quản lý log tập trung (Log Aggregation):**
  - Sử dụng **Grafana Loki** gom log từ hai container `app-api` và `app-worker` giúp dễ dàng tìm kiếm vết giao dịch theo mã đơn hàng (`order_code`).
- **APM & Tracing:**
  - Tích hợp **OpenTelemetry** đo đạc hiệu năng của bộ đối soát (Matching Engine) và các truy vấn cơ sở dữ liệu.

---