"use client";

import type { HomeActions } from "./home-v2";
import { HomeLeftNav } from "./home-left-nav";
import { HomeStoryRail } from "./home-story-rail";
import { HomeFeedPost } from "./home-feed-post";
import { HomeDesktopToolbar } from "./home-desktop-toolbar";
import { HomeDesktopFeatureCard } from "./home-desktop-feature-card";

export function HomeDesktop(props: HomeActions) {
  const media = [...props.data.media].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 6);
  const featured = media[0];
  return (
    <div className="home-v2-desktop">
      <HomeLeftNav data={props.data} character={props.character} navigate={props.navigate} />
      <main className="home-v2-workspace" aria-label="Home workspace">
        <div className="home-v2-workspace-inner">
          <HomeDesktopToolbar navigate={props.navigate} />
          <HomeStoryRail characters={props.data.characters} onCreate={() => props.navigate("create")} onCharacter={(id) => { props.setCharacter(id); props.navigate("character"); }} />
          {featured ? <>
            <HomeDesktopFeatureCard
              asset={featured}
              character={props.data.characters.find((person) => person.id === featured.characterId)}
              data={props.data}
              onOpen={props.select}
              onFavorite={props.favorite}
              onReference={props.reference}
              onRemix={(item) => props.create(item, item.type === "video" ? "video" : "image")}
              onCharacter={(id) => { props.setCharacter(id); props.navigate("character"); }}
              onMessage={props.openConversation}
              onCreate={() => props.create(featured, "video")}
            />
            {media.length > 1 && <div className="home-v2-feed home-v2-feed-secondary">
              {media.slice(1).map((asset, index) => <HomeFeedPost key={asset.id} asset={asset} character={props.data.characters.find((person) => person.id === asset.characterId)} priority={index === 0} onOpen={props.select} onFavorite={props.favorite} onReference={props.reference} onRemix={(item) => props.create(item, item.type === "video" ? "video" : "image")} onCharacter={(id) => { props.setCharacter(id); props.navigate("character"); }} />)}
            </div>}
          </> : <HomeEmpty onCreate={() => props.navigate("create")} />}
        </div>
      </main>
    </div>
  );
}

export function HomeMobile(props: HomeActions) {
  const media = [...props.data.media].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 6);
  return (
    <div className="home-v2-mobile">
      <HomeStoryRail characters={props.data.characters} onCreate={() => props.navigate("create")} onCharacter={(id) => { props.setCharacter(id); props.navigate("character"); }} />
      {media.length ? <div className="home-v2-feed">
        {media.map((asset, index) => <HomeFeedPost key={asset.id} asset={asset} character={props.data.characters.find((person) => person.id === asset.characterId)} priority={index === 0} onOpen={props.select} onFavorite={props.favorite} onReference={props.reference} onRemix={(item) => props.create(item, item.type === "video" ? "video" : "image")} onCharacter={(id) => { props.setCharacter(id); props.navigate("character"); }} />)}
      </div> : <HomeEmpty onCreate={() => props.navigate("create")} />}
    </div>
  );
}

function HomeEmpty({ onCreate }: { onCreate: () => void }) {
  return <section className="home-v2-empty"><h1>Your first scene starts here</h1><p>Your private creations will appear here.</p><button onClick={onCreate}>Create a scene</button></section>;
}
