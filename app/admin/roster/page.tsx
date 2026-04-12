"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import LogoutButton from "../ops/LogoutButton";
import RosterEditor from "../ops/RosterEditor";

export const dynamic = "force-dynamic";

export default function AdminRosterPage() {
  return (
    <main className="min-h-screen bg-background text-foreground p-6 md:p-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <AdminNav />
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">로스터 관리</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              선수 소속팀, 티어 수정 및 시스템 예외 처리를 관리합니다.
            </p>
          </div>
          <div className="flex gap-3">
            <LogoutButton />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
          1. 선수 검색  2. 값 선택  3. 저장
        </div>

        <section className="grid gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground md:grid-cols-3">
          <div>
            <p className="font-semibold text-foreground">1. 선수 선택</p>
            <p className="mt-1">이름 또는 팀명으로 검색하고 한 명을 고릅니다.</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">2. 값 수정</p>
            <p className="mt-1">소속, 티어, 수동 유형, 수집 제외 여부를 정합니다.</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">3. 저장 또는 해제</p>
            <p className="mt-1">임시 수동만 해제 가능하며 고정 수동은 유지됩니다.</p>
          </div>
        </section>

        <RosterEditor />
      </div>
    </main>
  );
}
