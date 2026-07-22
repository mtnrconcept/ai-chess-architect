import { useEffect } from "react";
import { useFxTrigger } from "@/fx/context";
import type { VFXAdapter } from "@/engine/adapters/vfxAdapter";

interface RuleRuntimeBridgeProps {
  vfxAdapter: VFXAdapter;
}

/** Connects the stable rule-engine adapter to the mounted Pixi FX provider. */
export default function RuleRuntimeBridge({
  vfxAdapter,
}: RuleRuntimeBridgeProps) {
  const triggerFx = useFxTrigger();

  useEffect(() => {
    vfxAdapter.setFxTrigger(triggerFx);
    return () => vfxAdapter.setFxTrigger(undefined);
  }, [triggerFx, vfxAdapter]);

  return null;
}
