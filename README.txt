STPHO LINE Webhook Relay (Render)
================================

เหตุผลที่ต้องใช้
- InfinityFree Free Hosting บล็อก webhook/automated inbound requests จากบริการภายนอก
- LINE จึงส่ง Webhook ตรงเข้า line_webhook.php ไม่ได้ในหลายกรณี
- Relay นี้รับ Webhook บน Render แล้วหน้า LINE Settings ของเว็บ InfinityFree จะดึง Destination ID ออกมาเอง

วิธี Deploy บน Render
1) อัปโหลดโฟลเดอร์ line-relay-render ไป GitHub repository
2) Render -> New -> Web Service -> เลือก repository
3) Runtime: Node
4) Build Command: เว้นว่าง หรือ npm install
5) Start Command: npm start
6) Environment Variables:
   LINE_CHANNEL_SECRET = Channel Secret จาก LINE Developers
   RELAY_KEY = ตั้งคีย์ยาวๆ ของคุณเอง เช่น สุ่ม 32+ ตัวอักษร
7) Deploy แล้วจะได้ URL เช่น https://your-service.onrender.com
8) LINE Developers -> Messaging API -> Webhook URL:
   https://your-service.onrender.com/webhook
9) เปิด Use webhook และเปิด Allow bot to join group chats
10) เชิญ LINE OA เข้ากลุ่ม แล้วส่งข้อความในกลุ่ม 1 ครั้ง
11) เว็บ -> Admin -> LINE แจ้งเตือน
    - Relay URL = https://your-service.onrender.com
    - Relay Key = ค่าเดียวกับ RELAY_KEY
    - กดบันทึก
    - กด “ดึง ID จาก Relay”
    - กด “ตรวจปลายทาง”
    - กด “ส่งข้อความทดสอบ”

Health check:
https://your-service.onrender.com/health

หมายเหตุ
- latest.json ใช้เพื่อช่วยจับ Destination ID ล่าสุด ไม่ได้เก็บเนื้อหาข้อความ LINE
- หลังได้ Group ID แล้ว การส่งข้อความจริงทำจากเว็บ InfinityFree ออกไป api.line.me โดยตรง
