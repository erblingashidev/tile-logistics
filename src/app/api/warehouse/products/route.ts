import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  listProducts,
  confirmProduct,
  upsertProduct,
} from "@/lib/services/products";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const products = await listProducts();
    return NextResponse.json(products);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const product = await upsertProduct({
      ean: body.ean,
      productName: body.productName,
      tileWidthCm: body.tileWidthCm,
      tileHeightCm: body.tileHeightCm,
      tileThicknessCm: body.tileThicknessCm,
      source: "manual",
      status: body.status === "confirmed" ? "confirmed" : "draft",
    });
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const product = await confirmProduct(Number(body.id));
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
