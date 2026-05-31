import { getCurrentUser } from "@/lib/session";
import AccountMenu from "./account-menu";

// Floating pill that anchors the account / settings dropdown. Always
// top-right on every breakpoint. Slides from 1rem to just below the
// sticky filter bar via the --chip-top CSS var that StickyBar publishes.
// z-[60] (not z-40): the AccountMenu dropdown is bound to this container's
// stacking context (the container has a z-index, creating one), so the
// menu's internal z-50 is locally scoped. The StickyBar is z-50 in the
// root context — at z-40 here, the StickyBar (which renders later in DOM
// order) would paint over the open AccountMenu, clipping it. z-[60] keeps
// the chip and its dropdown above both the StickyBar (z-50) and the
// FloatingToolbar (z-40).
const PILL = "fixed top-[var(--chip-top,1rem)] right-4 transition-[top] duration-300 z-[60] flex bg-white dark:bg-neutral-950 rounded-full p-0.5 border border-neutral-200 dark:border-white/15 shadow-[0_0_28px_-4px_rgb(0_0_0_/_0.12)] dark:shadow-[0_0_28px_-4px_rgb(0_0_0_/_0.5)]";

export default async function AccountChip() {
  const user = await getCurrentUser();
  const signedIn = !!user && !user.suspended;

  return (
    <div className={PILL}>
      <AccountMenu
        signedIn={signedIn}
        user={
          signedIn && user
            ? { name: user.name, email: user.email, image: user.image, role: user.role }
            : null
        }
      />
    </div>
  );
}
