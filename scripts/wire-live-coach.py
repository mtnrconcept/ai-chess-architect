from pathlib import Path

path = Path("src/pages/Play.tsx")
text = path.read_text()

import_line = 'import LiveCoachAvatar from "@/features/coach/LiveCoachAvatar";\n'
if import_line not in text:
    marker = 'import type { RuleJSON } from "@/engine/types";\n'
    if marker not in text:
        raise SystemExit("Play import marker missing")
    text = text.replace(marker, marker + import_line, 1)

latest_block = '''  const latestCoachMessage = useMemo(
    () =>
      [...coachMessages]
        .reverse()
        .find((message) => message.role === "coach")?.content ?? null,
    [coachMessages],
  );

  const openCoachPanel = useCallback(() => {
    document.getElementById("coach-panel")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

'''
render_marker = '''  /* ------------------------------------------------------------------------ */
  /*                              Rendu de la page                             */
  /* ------------------------------------------------------------------------ */
'''
if latest_block not in text:
    if render_marker not in text:
        raise SystemExit("Play render marker missing")
    text = text.replace(render_marker, latest_block + render_marker, 1)

old_aside = '<aside className="flex min-h-[420px] max-h-[75vh] flex-col rounded-lg border border-white/10 bg-black/25 p-4">'
new_aside = '<aside id="coach-panel" className="flex min-h-[420px] max-h-[75vh] scroll-mt-24 flex-col rounded-lg border border-white/10 bg-black/25 p-4">'
if new_aside not in text:
    if old_aside not in text:
        raise SystemExit("Coach aside marker missing")
    text = text.replace(old_aside, new_aside, 1)

avatar_block = '''
      <LiveCoachAvatar
        enabled={coachEnabled}
        loading={coachLoading}
        message={latestCoachMessage}
        error={coachError}
        moveCount={gameState.moveHistory.length}
        onOpen={openCoachPanel}
        onEnable={() => setCoachEnabled(true)}
      />
'''
if avatar_block not in text:
    closing = "      </section>\n    </main>\n"
    if closing not in text:
        raise SystemExit("Play main closing marker missing")
    text = text.replace(closing, "      </section>\n" + avatar_block + "    </main>\n", 1)

path.write_text(text)
