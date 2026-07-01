import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  listProducts,
  confirmProduct,
  upsertProduct,
  updateProduct,
  searchProducts,
  deleteProduct,
  deleteProducts,
} from "@/lib/services/products";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const limit = Number(searchParams.get("limit") ?? "200");
    if (q) {
      const products = await searchProducts(q, Math.min(limit, 30));
      return NextResponse.json(products);
    }
    const products = await listProducts(Math.min(limit, 500));
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
      unit: body.unit,
      tileWidthCm: body.tileWidthCm,
      tileHeightCm: body.tileHeightCm,
      tileThicknessCm: body.tileThicknessCm,
      piecesPerPallet: body.piecesPerPallet,
      m2PerPallet: body.m2PerPallet,
      kgPerPallet: body.kgPerPallet,
      piecesPerPack: body.piecesPerPack,
      m2PerPack: body.m2PerPack,
      kgPerPack: body.kgPerPack,
      unitWeightKg: body.unitWeightKg,
      palletFootprintLengthCm: body.palletFootprintLengthCm,
      palletFootprintWidthCm: body.palletFootprintWidthCm,
      replacesStandardPallets: body.replacesStandardPallets,
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

    const hasSpecUpdate =
      body.productName !== undefined ||
      body.ean !== undefined ||
      body.unit !== undefined ||
      body.piecesPerPallet !== undefined ||
      body.m2PerPallet !== undefined ||
      body.kgPerPallet !== undefined ||
      body.tileWidthCm !== undefined ||
      body.tileHeightCm !== undefined ||
      body.palletFootprintLengthCm !== undefined ||
      body.palletFootprintWidthCm !== undefined ||
      body.replacesStandardPallets !== undefined ||
      body.status !== undefined;

    if (hasSpecUpdate) {
      const result = await updateProduct(Number(body.id), {
        ean: body.ean,
        productName: body.productName,
        unit: body.unit,
        tileWidthCm: body.tileWidthCm,
        tileHeightCm: body.tileHeightCm,
        tileThicknessCm: body.tileThicknessCm,
        piecesPerPallet: body.piecesPerPallet,
        m2PerPallet: body.m2PerPallet,
        kgPerPallet: body.kgPerPallet,
        piecesPerPack: body.piecesPerPack,
        m2PerPack: body.m2PerPack,
        kgPerPack: body.kgPerPack,
        unitWeightKg: body.unitWeightKg,
        palletFootprintLengthCm: body.palletFootprintLengthCm,
        palletFootprintWidthCm: body.palletFootprintWidthCm,
        replacesStandardPallets: body.replacesStandardPallets,
        source: "manual",
        status: body.status === "confirmed" ? "confirmed" : body.status,
        notes: body.notes,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result.product);
    }

    const product = await confirmProduct(Number(body.id));
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids)
      ? body.ids.map(Number)
      : body.id != null
        ? [Number(body.id)]
        : [];

    if (ids.length === 1) {
      const result = await deleteProduct(ids[0]);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json(result);
    }

    const result = await deleteProducts(ids);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
