import { useState, useEffect } from 'react';

export default function Dashboard() {
    const [data, setData] = useState({
        temp: 0,
        hum: 0,
        relay: false,
        mode: 0,
        triggerWatering: false,
    });
    const [loading, setLoading] = useState(false);

    // Map เลขโหมดเป็นข้อความภาษาไทย
    const modeNames = {
        0: 'MANUAL MODE (ควบคุมเอง)',
        1: 'TIMER MODE (ตั้งเวลา)',
        2: 'SENSOR MODE (อัตโนมัติ)',
    };

    // 1. ดึงข้อมูลจาก Vercel API ทุกๆ 2 วินาที
    const fetchData = async () => {
        try {
            const res = await fetch('/api/status');
            const result = await res.json();
            setData(result);
        } catch (err) {
            console.error('Fetch error:', err);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 2000);
        return () => clearInterval(interval);
    }, []);

    // 2. ฟังก์ชันกดเปลี่ยนโหมด (Manual / Timer / Sensor)
    const handleSetMode = async (newMode) => {
        setLoading(true);
        try {
            await fetch('/api/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set_mode', mode: newMode }),
            });
            await fetchData(); // ดึงค่าใหม่ทันที
        } catch (err) {
            console.error('Set mode error:', err);
        }
        setLoading(false);
    };

    // 3. ฟังก์ชันกดปุ่มสั่ง "เปิด/ปิด รดน้ำ" (ใช้ได้ใน MANUAL MODE)
    const handleToggleWatering = async () => {
        if (data.mode !== 0) {
            alert('กรุณาเปลี่ยนเป็น MANUAL MODE ก่อนสั่งรดน้ำครับ');
            return;
        }

        setLoading(true);
        try {
            await fetch('/api/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggle_watering' }),
            });
            await fetchData(); // ดึงค่าใหม่ทันที
        } catch (err) {
            console.error('Toggle watering error:', err);
        }
        setLoading(false);
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '500px', margin: '0 auto' }}>
            <h2>🌱 Hydroponic Control Dashboard</h2>

            {/* บล็อกแสดงสถานะโหมดปัจจุบัน */}
            <div style={{ background: '#f0f4f8', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                <strong>โหมดการทำงานปัจจุบัน:</strong>
                <h3 style={{ color: '#0284c7', margin: '5px 0' }}>
                    {modeNames[data.mode] || 'ไม่ทราบโหมด'}
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
                    สถานะวาล์วรดน้ำ: {data.relay ? '🟢 กำลังรดน้ำ' : '🔴 ปิดอยู่'}
                </p>
            </div>

            {/* บล็อกแสดงค่าเซนเซอร์ */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <div style={{ flex: 1, background: '#fff1f2', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                    <small>อุณหภูมิ</small>
                    <h3>{data.temp} °C</h3>
                </div>
                <div style={{ flex: 1, background: '#f0fdf4', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                    <small>ความชื้น</small>
                    <h3>{data.hum} %</h3>
                </div>
            </div>

            {/* ปุ่มกดสลับโหมด */}
            <div style={{ marginBottom: '15px' }}>
                <label>เลือกโหมด:</label>
                <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                    <button disabled={loading} onClick={() => handleSetMode(0)}>Manual</button>
                    <button disabled={loading} onClick={() => handleSetMode(1)}>Timer</button>
                    <button disabled={loading} onClick={() => handleSetMode(2)}>Sensor</button>
                </div>
            </div>

            {/* ปุ่มกดสั่งรดน้ำ (ทำงานเฉพาะ Manual Mode) */}
            <button
                onClick={handleToggleWatering}
                disabled={loading || data.mode !== 0}
                style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    color: '#fff',
                    backgroundColor: data.mode !== 0 ? '#ccc' : data.triggerWatering ? '#ef4444' : '#22c55e',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: data.mode !== 0 ? 'not-allowed' : 'pointer',
                }}
            >
                {data.mode !== 0
                    ? 'สั่งงานได้เฉพาะ MANUAL MODE'
                    : data.triggerWatering
                        ? '⏹️ สั่งหยุดรดน้ำ'
                        : '💧 สั่งเปิดรดน้ำ'}
            </button>
        </div>
    );
}