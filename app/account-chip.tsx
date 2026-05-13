import { getCurrentUser } from "@/lib/session";
import AccountMenu from "./account-menu";

// Floating pill that anchors the account / settings dropdown. Always
// top-right on every breakpoint. Slides from 1rem to just below the
// sticky filter bar via the --chip-top CSS var that StickyBar publishes.
const PILL = "fixed top-[var(--chip-top,1rem)] right-4 transition-[top] duration-300 z-40 flex bg-white dark:bg-neutral-800 rounded-md p-0.5 border border-neutral-200 dark:border-white/15 shadow-xl shadow-black/15 dark:shadow-black/50";

export default async function AccountChip() {
  const user = await getCurrentUser();
  const signedIn = !!user && !user.suspended;

  return (
    <div className={PILL}>
      <AccountMenu
        signedIn={signedIn}
        user={
          signedIn && user
            ? { name: user.name, email: user.email, image: user.image }
            : null
        }
      />
    </div>
  );
}
