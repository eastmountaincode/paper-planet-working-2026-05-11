import { notFound } from "next/navigation";
import { RoomExperience } from "@/components/room-experience";
import { getScene, sceneSlugs } from "@/lib/scenes";

type RoomPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return sceneSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: RoomPageProps) {
  const { slug } = await params;
  const scene = getScene(slug);

  return {
    title: scene ? `${scene.title} | Paper Planet` : "Paper Planet",
  };
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { slug } = await params;
  const scene = getScene(slug);

  if (!scene) {
    notFound();
  }

  return <RoomExperience scene={scene} />;
}
