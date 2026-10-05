import { permanentRedirect } from "next/navigation";

export default async function MovedPage({ params }: { params: Promise<{ id: string }> }) {
  permanentRedirect(`/new/paths/${(await params).id}`);
}
