import { getCurrentUser } from "@/lib/session";
import EventForm from "../../../../admin/_components/EventForm";
import SubpageShell from "../../_components/SubpageShell";

export const dynamic = "force-dynamic";

export default async function NewAccountEventPage() {
  const user = await getCurrentUser();
  const publishesImmediately = user?.role === "organizer" || user?.role === "admin";

  return (
    <SubpageShell
      title="Create an event"
      description={
        publishesImmediately
          ? "Your event goes live immediately and shows up on the public calendar."
          : "Your event will be reviewed by an admin before it appears on the public calendar."
      }
      maxWidth="max-w-3xl"
    >
      <EventForm endpoint="/api/account/events" method="POST" redirectTo="/account/events" showStatus={false} />
    </SubpageShell>
  );
}
