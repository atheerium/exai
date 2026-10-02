import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { safeParse } from "@/lib/serialize";
import { FavouritesView } from "@/components/dashboard/favourites";

interface SavedContent {
  prompt: string;
  marks?: number;
  instruction?: string | null;
}

// Mirrors the API routes: a single unparseable row must not crash the page.
const parseContent = (raw: string): SavedContent => safeParse<SavedContent>(raw, { prompt: "" });

export default async function FavouritesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [favourites, customs] = await Promise.all([
    prisma.favouriteTask.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    prisma.customTask.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <FavouritesView
      favourites={favourites.map((f) => ({ id: f.id, label: f.label, content: parseContent(f.content) }))}
      customs={customs.map((c) => ({ id: c.id, label: c.label, content: parseContent(c.content) }))}
    />
  );
}
