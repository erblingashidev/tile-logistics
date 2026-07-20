import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  clearProDataBalances,
  finishProDataImport,
  importProDataBalancesChunk,
  importProDataProductsChunk,
  prepareProDataImport,
} from "@/lib/integrations/prodata-stock";

export const runtime = "nodejs";
/** Each request must stay under Netlify's ~10s hard limit. */
export const maxDuration = 26;

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Upload a Pro-Data Excel (.xlsx) file." },
          { status: 400 }
        );
      }
      if (file.size > 15 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Excel file is too large (max 15 MB)." },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await prepareProDataImport(buffer);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "products") {
      const result = await importProDataProductsChunk(body.products ?? []);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (action === "clear") {
      const result = await clearProDataBalances(body.locationIds ?? []);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (action === "balances") {
      const result = await importProDataBalancesChunk(body.balances ?? []);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (action === "finish") {
      await finishProDataImport({
        locationIds: body.locationIds ?? [],
        productsCreated: Number(body.productsCreated) || 0,
        balancesWritten: Number(body.balancesWritten) || 0,
        balancesCleared: Number(body.balancesCleared) || 0,
        balanceCount: Number(body.balanceCount) || 0,
        productCount: Number(body.productCount) || 0,
        negativesClamped: Number(body.negativesClamped) || 0,
        warnings: Array.isArray(body.warnings) ? body.warnings : [],
        sampleEan: body.sampleEan,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      {
        error:
          'Upload .xlsx, or POST JSON action: products | clear | balances | finish.',
      },
      { status: 400 }
    );
  } catch (err) {
    console.error("[warehouse/stock/import]", err);
    return NextResponse.json(
      {
        error: errorMessage(
          err,
          "Pro-Data import failed. Try again after the latest deploy."
        ),
      },
      { status: 500 }
    );
  }
}
