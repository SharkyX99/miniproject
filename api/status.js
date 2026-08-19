import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
    // ตั้งค่า CORS ให้ ESP32 และ Dashboard เข้าถึงได้
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'POST') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            // 1. ESP32 ส่งค่า Temp/Hum
            if (body?.action === 'esp32_update') {
                await redis.set('esp32_state', {
                    temp: body.temp,
                    hum: body.hum,
                    relay: body.relay,
                    lastSeen: Date.now()
                });

                const control = (await redis.get('esp32_control')) || { mode: 0, triggerWatering: false };
                return res.status(200).json(control);
            }

            // 2. Dashboard เปลี่ยนโหมด
            if (body?.action === 'set_mode') {
                let control = (await redis.get('esp32_control')) || { mode: 0, triggerWatering: false };
                control.mode = body.mode;
                await redis.set('esp32_control', control);
                return res.status(200).json({ success: true, mode: control.mode });
            }

            // 3. Dashboard สั่งรดน้ำ
            if (body?.action === 'toggle_watering') {
                let control = (await redis.get('esp32_control')) || { mode: 0, triggerWatering: false };
                control.triggerWatering = !control.triggerWatering;
                await redis.set('esp32_control', control);
                return res.status(200).json({ success: true, triggerWatering: control.triggerWatering });
            }

            return res.status(200).json({ status: 'ok' });
        }

        if (req.method === 'GET') {
            const state = (await redis.get('esp32_state')) || { temp: 0, hum: 0, relay: false };
            const control = (await redis.get('esp32_control')) || { mode: 0, triggerWatering: false };
            return res.status(200).json({ ...state, ...control });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}