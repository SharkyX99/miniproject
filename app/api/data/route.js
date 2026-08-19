import { NextResponse } from 'next/server';

// ตัวแปรจำลองเก็บข้อมูลใน Memory (หากต้องการเก็บบันทึกถาวร แนะนำเชื่อม Vercel KV / Postgres)
let globalData = {
    temperature: 0,
    humidity: 0,
    relay_status: "OFF",
    threshold_set: 35.0,
    relay_command: "AUTO"
};

// ESP32 ยิง GET มาอ่านค่าคำสั่งควบคุม หรือ Dashboard อ่านค่าไปแสดงผล
export async function GET() {
    return NextResponse.json(globalData);
}

// ESP32 ยิง POST มาอัปเดตอุณหภูมิและความชื้น
export async function POST(request) {
    try {
        const body = await request.json();
        globalData = { ...globalData, ...body };
        return NextResponse.json({ status: "success", data: globalData });
    } catch (error) {
        return NextResponse.json({ status: "error", message: error.message }, { status: 400 });
    }
}