import { useState, useEffect, useCallback, type ReactNode } from "react";
import { SnapCard, type SnapPage, type SnapActionHandlers } from "@farcaster/snap/react";

// ---------------------------------------------------------------------------
// Demo definitions
// ---------------------------------------------------------------------------

interface Demo {
  id: string;
  name: string;
  emoji: string;
  type: string;
  castHash: string;
  /** For multi-page snaps (quiz, tutorial), list all page IDs */
  pageIds?: string[];
}

const INTERACTIVE: Demo[] = [
  { id: "ss-poll", name: "Poll", emoji: "📊", type: "poll", castHash: "0x8ef5ecf12908599d23db05e470457a6b062951ff" },
  { id: "ss-quiz-0", name: "Quiz", emoji: "🧠", type: "quiz", castHash: "0x132995340322b5a09abcc7d78e622060ce3fa1a0", pageIds: ["ss-quiz-0", "ss-quiz-1", "ss-quiz-2"] },
  { id: "ss-rating", name: "Rating", emoji: "⭐", type: "rating", castHash: "0xf24d7139a1f43c149f57699ec2b63353ac6fc81c" },
  { id: "ss-text-entry", name: "Text Entry", emoji: "📝", type: "text-entry", castHash: "0x1cba53c574658b47657a37be54dc04f839a411a0" },
  { id: "ss-claim", name: "Claim", emoji: "🎁", type: "claim", castHash: "0xb765a18aeb15cec38776eb989e8d16e47ab169b8" },
];

const TOKEN: Demo[] = [
  { id: "ss-tip-jar", name: "Tip Jar", emoji: "💰", type: "tip-jar", castHash: "0x1d612c8899d34382dd6855b8fbf101c2cf978fbb" },
  { id: "ss-token-buy", name: "Token Buy", emoji: "🔄", type: "token-buy", castHash: "0x9426f1d7362733efd480d6d53658331300e7fd51" },
  { id: "ss-token-showcase", name: "Token Showcase", emoji: "📈", type: "token-showcase", castHash: "0xfce667d4c0530e1d0cd5a10b533d69058f90b792" },
];

const INFO: Demo[] = [
  { id: "ss-tutorial-0", name: "Tutorial", emoji: "📖", type: "tutorial", castHash: "0xe9cc4f4008b48a97296b701059e5cdf09eb38b95", pageIds: ["ss-tutorial-0", "ss-tutorial-1", "ss-tutorial-2"] },
  { id: "explainer-moga5aqe-0", name: "Explainer", emoji: "💡", type: "explainer", castHash: "0x096d4471f096643d64a43582ee667aba3d2ea18c" },
  { id: "cheat-sheet-moga5go9-0", name: "Cheat Sheet", emoji: "📋", type: "cheat-sheet", castHash: "0x336a12ae1873405d4496972632aa159afdf8609a" },
  { id: "comparison-moga5gyv-0", name: "Comparison", emoji: "⚖️", type: "comparison", castHash: "0xb65e73a5e1ffdffa66ab58ca7498803e1b902721" },
  { id: "resource-list-moga5h91-0", name: "Resource List", emoji: "🔗", type: "resource-list", castHash: "0xfff560f271e78dda12bb557b4348b5f23ce2125e" },
];

// ---------------------------------------------------------------------------
// Snap fetcher hook
// ---------------------------------------------------------------------------

function useSnap(initialId: string) {
  const [snap, setSnap] = useState<SnapPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnap = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/${id}`, {
        headers: { Accept: "application/vnd.farcaster.snap+json" },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setSnap(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSnap(initialId); }, [initialId, fetchSnap]);

  return { snap, loading, error, refetch: fetchSnap };
}

// ---------------------------------------------------------------------------
// Action handlers (standalone / website context)
// ---------------------------------------------------------------------------

function makeHandlers(onNavigate: (id: string) => void): SnapActionHandlers {
  return {
    submit: async (target, inputs) => {
      try {
        const res = await fetch(target, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/vnd.farcaster.snap+json",
          },
          body: JSON.stringify({
            header: { fid: 0, timestamp: Math.floor(Date.now() / 1000) },
            payload: { fid: 0, inputs, timestamp: Math.floor(Date.now() / 1000) },
            signature: "standalone-preview",
          }),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        onNavigate(new URL(target).pathname);
        return data;
      } catch {
        // POST will fail without JFS sig — that's fine for preview
        alert("This snap requires a Farcaster account to interact. Open it in Farcaster to try it live!");
      }
    },
    open_url: (target) => window.open(target, "_blank"),
    open_snap: (target) => window.open(target, "_blank"),
    open_mini_app: (target) => window.open(target, "_blank"),
    view_cast: ({ hash }) => window.open(`https://warpcast.com/suchbot/${hash}`, "_blank"),
    view_profile: ({ fid }) => window.open(`https://warpcast.com/${fid}`, "_blank"),
    compose_cast: () => alert("Compose is only available inside Farcaster"),
    view_token: ({ token }) => alert(`Token: ${token} — view in Farcaster`),
    send_token: () => alert("Token actions require a Farcaster wallet. Open in Farcaster to use."),
    swap_token: () => alert("Token actions require a Farcaster wallet. Open in Farcaster to use."),
  };
}

// ---------------------------------------------------------------------------
// SnapPreview — fetches and renders a single snap
// ---------------------------------------------------------------------------

function SnapPreview({ demo }: { demo: Demo }) {
  const { snap, loading, error, refetch } = useSnap(demo.id);
  const [currentId, setCurrentId] = useState(demo.id);
  const handlers = makeHandlers(setCurrentId);

  // Re-fetch when currentId changes (page navigation)
  const effectiveSnap = useSnap(currentId);

  useEffect(() => {
    if (currentId !== demo.id) {
      // We navigated to a new page, use the new snap
    }
  }, [currentId, demo.id]);

  const displaySnap = currentId === demo.id ? snap : effectiveSnap.snap;
  const displayLoading = currentId === demo.id ? loading : effectiveSnap.loading;
  const displayError = currentId === demo.id ? error : effectiveSnap.error;

  const castUrl = `https://warpcast.com/suchbot/${demo.castHash}`;

  return (
    <div className="demo-card">
      <div className="demo-card-header">
        <div className="demo-card-title">
          <h3>{demo.emoji} {demo.name}</h3>
          <span className="type-badge">{demo.type}</span>
        </div>
        <a
          className="view-cast-btn"
          href={castUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLinkIcon />
          View Cast
        </a>
      </div>
      <div className="demo-card-snap">
        {displayLoading && <div className="loading">Loading snap…</div>}
        {displayError && <div className="error">Failed to render</div>}
        {displaySnap && (
          <SnapCard
            snap={displaySnap}
            handlers={handlers}
            appearance="dark"
            maxWidth={480}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// External link icon
// ---------------------------------------------------------------------------

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------

function Section({
  icon,
  iconClass,
  title,
  description,
  demos,
}: {
  icon: string;
  iconClass: string;
  title: string;
  description: string;
  demos: Demo[];
}) {
  return (
    <section className="section">
      <div className="section-header">
        <div className={`section-icon ${iconClass}`}>{icon}</div>
        <h2>{title}</h2>
        <span className="desc">{description}</span>
      </div>
      <div className="grid">
        {demos.map((d) => (
          <SnapPreview key={d.id} demo={d} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <>
      <div className="hero container">
        <h1>
          <span>such snap</span>
        </h1>
        <p>
          Template-based interactive snaps for Farcaster.
          Mention <b>@suchbot</b> with a description — get a working snap in under 15 seconds.
        </p>
        <div className="hero-badges">
          <span className="hero-badge"><b>13</b> template types</span>
          <span className="hero-badge"><b>&lt;15s</b> deploy</span>
          <span className="hero-badge"><b>AI agent</b> powered</span>
          <span className="hero-badge"><b>Open source</b></span>
        </div>
      </div>

      <div className="container">
        <Section
          icon="⚡"
          iconClass="interactive"
          title="Interactive"
          description="Server-side state, per-user tracking"
          demos={INTERACTIVE}
        />
        <Section
          icon="🪙"
          iconClass="token"
          title="Token Actions"
          description="Native wallet flows in one tap"
          demos={TOKEN}
        />
        <Section
          icon="📄"
          iconClass="info"
          title="Informational"
          description="Content-first, no state needed"
          demos={INFO}
        />
      </div>

      <footer className="footer container">
        <p>
          Built by <a href="https://warpcast.com/suchbot" target="_blank" rel="noopener">@suchbot</a>{" "}
          ·{" "}
          <a href="https://github.com/wowsuchbot/snap-server" target="_blank" rel="noopener">GitHub</a>
        </p>
      </footer>
    </>
  );
}
