import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/services/orders";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getDashboardStats());
}
