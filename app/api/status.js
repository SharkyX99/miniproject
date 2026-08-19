import { Redis } from '@upstash/redis';

// เชื่อมต่อ Upstash Redis (สร้างฟรีใน Vercel Storage)
const redis = Redis.fromEnv();

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        if (req.method === 'POST') {
            const body = req.body;

            // 1. ESP32 ส่งค่า Temp/Hum มาอัปเดต และรับคำสั่งกลับไป
            if (body.action === 'esp32_update') {
                await redis.set('esp32_state', {
                    temp: body.temp,
                    hum: body.hum,
                    relay: body.relay,
                    lastSeen: Date.now()
                });

                const control = (await redis.get('esp32_control')) || { mode: 0, triggerWatering: false };
                return res.status(200).json(control);
            }

            // 2. Dashboard เปลี่ยนโหมด (Manual / Timer / Sensor)
            if (body.action === 'set_mode') {
                let control = (await redis.get('esp32_control')) || { mode: 0, triggerWatering: false };
                control.mode = body.mode;
                await redis.set('esp32_control', control);
                return res.status(200).json({ success: true, mode: control.mode });
            }

            // 3. Dashboard สั่งเปิด/ปิด รดน้ำ
            if (body.action === 'toggle_watering') {
                let control = (await redis.get('esp32_control')) || { mode: 0, triggerWatering: false };
                control.triggerWatering = !control.triggerWatering;
                await redis.set('esp32_control', control);
                return res.status(200).json({ success: true, triggerWatering: control.triggerWatering });
            }
        }

        // 4. Dashboard ดึงข้อมูลสถานะปัจจุบันไปแสดงผล
        if (req.method === 'GET') {
            const state = (await redis.get('esp32_state')) || { temp: 0, hum: 0, relay: false };
            const control = (await redis.get('esp32_control')) || { mode: 0, triggerWatering: false };
            return res.status(200).json({ ...state, ...control });
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}