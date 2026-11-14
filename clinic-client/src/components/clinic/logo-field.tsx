"use client";

import { useState } from "react";

export function LogoField({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <label className="grid gap-1 text-sm">
      Logo
      <input
        type="file"
        accept="image/png,image/jpeg"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => setValue(typeof reader.result === "string" ? reader.result : "");
          reader.readAsDataURL(file);
        }}
      />
      <input type="hidden" name="logoDataUrl" value={value} />
      {value ? <span className="text-xs text-muted-foreground">A logo is attached.</span> : null}
    </label>
  );
}
