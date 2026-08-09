import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { FavouritesView } from "@/components/dashboard/favourites";

export default async function FavouritesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [favourites, customs] = await Promise.all([
    prisma.favouriteTask.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    prisma.customTask.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <FavouritesView
      favourites={favourites.map((f) => ({ id: f.id, label: f.label, content: JSON.parse(f.content) }))}
      customs={customs.map((c) => ({ id: c.id, label: c.label, content: JSON.parse(c.content) }))}
    />
  );
}
