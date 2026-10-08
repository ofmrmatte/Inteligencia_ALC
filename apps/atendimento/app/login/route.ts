import { NextResponse } from "next/server";
import { inteligenciaEntryUrl } from "@/lib/auth";
export function GET() {
  return NextResponse.redirect(inteligenciaEntryUrl());
}
