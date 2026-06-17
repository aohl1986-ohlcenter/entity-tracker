import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  (await cookies()).delete(COOKIE_NAME);
  return NextResponse.redirect(new URL("/login", req.url));
}
