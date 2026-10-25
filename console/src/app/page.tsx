"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SessionGate } from "../lib/session";
import { homePath } from "../lib/permissions";
import type { Me } from "../lib/types";

function GoHome({ me }: { me: Me }) {
  const router = useRouter();
  useEffect(() => { router.replace(homePath(me)); }, [me, router]);
  return null;
}

/** `/`: the guard decides (sign-in, password change) or the first section the person may open. */
export default function Index() {
  return <SessionGate page="panel">{(me) => <GoHome me={me} />}</SessionGate>;
}
