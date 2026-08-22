import { describe, expect, test } from "bun:test";
import { Box3, Mesh, Vector3 } from "three";
import {
  GENERATED_GEM_STYLE_KEYS,
  GEM_STYLE_KEYS,
  GEM_STYLES,
  buildGemStyle,
  isGemStyleKey,
} from "../src/game/gemStyles";

describe("gem style model kit", () => {
  test("publishes the classic model and four purchasable silhouettes", () => {
    expect(GEM_STYLE_KEYS).toEqual([
      "gem_classic",
      "gem_emerald",
      "gem_ruby",
      "gem_diamond",
      "gem_dragonheart",
    ]);
    expect(isGemStyleKey("gem_diamond")).toBe(true);
    expect(isGemStyleKey("gem_unknown")).toBe(false);
  });

  test("offers recognizable real gemstones with generated hero-model sources", () => {
    expect(GENERATED_GEM_STYLE_KEYS).toEqual(["gem_emerald", "gem_dragonheart"]);
    expect(GEM_STYLES.gem_emerald).toMatchObject({
      name: "Mega Emerald",
      shape: "emerald",
      modelUrl: "/assets/models/gems/emerald/model.glb",
      modelRotationY: Math.PI / 2,
    });
    expect(GEM_STYLES.gem_ruby).toMatchObject({
      name: "Power Ruby",
      shape: "ruby",
    });
    expect(GEM_STYLES.gem_ruby.modelUrl).toBeUndefined();
    expect(GEM_STYLES.gem_diamond).toMatchObject({
      name: "Super Diamond",
      shape: "diamond",
    });
    expect(GEM_STYLES.gem_diamond.modelUrl).toBeUndefined();
    expect(GEM_STYLES.gem_dragonheart).toMatchObject({
      name: "Dragonheart Gem",
      shape: "heart",
      modelUrl: "/assets/models/gems/dragonheart/model.glb",
      modelRotationY: -Math.PI / 2,
      previewUrl: "/assets/models/gems/dragonheart/preview.webp",
    });
  });

  test("every generated gem still keeps a procedural fallback for a failed load", () => {
    // loadAssets() only swaps in a GLB when it parses; buildGemStyle has to stand
    // alone for every key or a network hiccup leaves the mine target empty.
    for (const key of GENERATED_GEM_STYLE_KEYS) {
      expect(GEM_STYLES[key].modelUrl).toBeString();
      expect(buildGemStyle(key).children.length).toBeGreaterThan(0);
    }
  });

  test("every style builds a layered, centered mine target with authored materials", () => {
    for (const key of GEM_STYLE_KEYS) {
      const model = buildGemStyle(key);
      model.updateMatrixWorld(true);

      let meshes = 0;
      const materials = new Set();
      model.traverse((object) => {
        if (object instanceof Mesh) {
          meshes += 1;
          materials.add(object.material);
        }
      });

      const bounds = new Box3().setFromObject(model);
      const size = bounds.getSize(new Vector3());
      const center = bounds.getCenter(new Vector3());
      expect(meshes, `${key} should have layered fallback geometry`).toBeGreaterThanOrEqual(5);
      expect(materials.size, `${key} should use material contrast`).toBeGreaterThanOrEqual(2);
      expect(size.y, `${key} should read clearly at the hero scale`).toBeGreaterThan(1.4);
      expect(Math.abs(center.x), `${key} should be centered on x`).toBeLessThan(0.15);
    }
  });

  test("the authored diamond has a crown, girdle, pavilion, and inner star facet", () => {
    const diamond = buildGemStyle("gem_diamond");
    expect(diamond.getObjectByName("diamondCrown")).toBeDefined();
    expect(diamond.getObjectByName("diamondGirdle")).toBeDefined();
    expect(diamond.getObjectByName("diamondPavilion")).toBeDefined();
    expect(diamond.getObjectByName("diamondStarCore")).toBeDefined();
  });

  test("shop metadata gives every model a readable preview identity", () => {
    for (const key of GEM_STYLE_KEYS) {
      expect(GEM_STYLES[key].name.length).toBeGreaterThan(3);
      expect(GEM_STYLES[key].blurb.length).toBeGreaterThan(8);
      expect(GEM_STYLES[key].tint).toMatch(/^#[0-9a-f]{6}$/i);
      expect(GEM_STYLES[key].shape).toMatch(/^(geode|emerald|ruby|diamond|heart)$/);
    }
  });
});
