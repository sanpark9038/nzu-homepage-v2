import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import fs from "node:fs";
import path from "node:path";

const STANDINGS_PATH = path.join(
  process.cwd(),
  "data",
  "metadata",
  "tournament_standings.v1.json"
);

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSession(sessionValue)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await request.json();
    
    // Ensure standard structure
    const updatedData = {
      ...data,
      updated_at: new Date().toISOString(),
      schema_version: "1.0.0"
    };

    fs.writeFileSync(STANDINGS_PATH, JSON.stringify(updatedData, null, 2), "utf8");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to save standings:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
