import { NextResponse } from "next/server";
import { runApiWithTenant } from "@/lib/auth/api-guard";
import type { SessionUser } from "@/lib/auth/session";
import { sessionHasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  createCustomerReturn,
  listCustomerReturns,
  lookupOrderForReturn,
} from "@/lib/services/customer-returns";
import { isReturnCondition } from "@/lib/customer-return-conditions";

export const runtime = "nodejs";

function canAccessReturns(session: SessionUser) {
  if (session.role === "admin") return true;
  return sessionHasPermission(session, PERMISSIONS.returnsRead);
}

function canWriteReturns(session: SessionUser) {
  if (session.role === "admin") return true;
  return sessionHasPermission(session, PERMISSIONS.returnsWrite);
}

export async function GET(request: Request) {
  return runApiWithTenant(async ({ session }) => {
    if (!canAccessReturns(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const url = new URL(request.url);
    const invoice = url.searchParams.get("invoice")?.trim();
    if (invoice) {
      const order = await lookupOrderForReturn(invoice);
      if (!order) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }
      return NextResponse.json(order);
    }
    return NextResponse.json({ returns: await listCustomerReturns() });
  });
}

export async function POST(request: Request) {
  return runApiWithTenant(async ({ session }) => {
    if (!canWriteReturns(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = (await request.json()) as {
      invoiceNumber?: string;
      notes?: string;
      lines?: Array<{
        orderItemId: number;
        quantity: number;
        condition: string;
        notes?: string;
      }>;
    };

    const invoiceNumber = body.invoiceNumber?.trim();
    if (!invoiceNumber) {
      return NextResponse.json(
        { error: "Invoice number is required." },
        { status: 400 }
      );
    }

    const lines = (body.lines ?? []).filter(
      (l) =>
        Number.isFinite(l.orderItemId) &&
        l.orderItemId > 0 &&
        isReturnCondition(l.condition)
    );

    const result = await createCustomerReturn({
      invoiceNumber,
      notes: body.notes,
      lines: lines.map((l) => ({
        orderItemId: l.orderItemId,
        quantity: Number(l.quantity),
        condition: l.condition as "untouched" | "chipped" | "broken",
        notes: l.notes,
      })),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  });
}
