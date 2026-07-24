import {
  Box3,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";

export type GemStyleKey =
  | "gem_classic"
  | "gem_emerald"
  | "gem_ruby"
  | "gem_diamond"
  | "gem_dragonheart";

export type GemStyleSpec = {
  name: string;
  blurb: string;
  tint: string;
  shape: "geode" | "emerald" | "ruby" | "diamond" | "heart";
  modelUrl?: string;
  modelRotationY?: number;
};

export const GEM_STYLES: Record<GemStyleKey, GemStyleSpec> = {
  gem_classic: {
    name: "Classic Geode",
    blurb: "Rock shell with a violet crystal cave",
    tint: "#b197fc",
    shape: "geode",
  },
  gem_emerald: {
    name: "Mega Emerald",
    blurb: "A giant green treasure with super-shiny steps",
    tint: "#2cff88",
    shape: "emerald",
    modelUrl: "/assets/models/gems/emerald/model.glb",
    modelRotationY: Math.PI / 2,
  },
  gem_ruby: {
    name: "Power Ruby",
    blurb: "A blazing red jewel packed with hero power",
    tint: "#ff365f",
    shape: "ruby",
  },
  gem_diamond: {
    name: "Super Diamond",
    blurb: "An icy-bright diamond that flashes every color",
    tint: "#c8f5ff",
    shape: "diamond",
  },
  gem_dragonheart: {
    name: "Dragonheart Gem",
    blurb: "A fiery heart guarded by obsidian horns",
    tint: "#ff5b4d",
    shape: "heart",
  },
};

export const GEM_STYLE_KEYS = Object.keys(GEM_STYLES) as GemStyleKey[];
export const GENERATED_GEM_STYLE_KEYS = [
  "gem_emerald",
] as const satisfies readonly GemStyleKey[];

export function isGemStyleKey(key: string): key is GemStyleKey {
  return key in GEM_STYLES;
}

const rockMaterial = () => new MeshStandardMaterial({
  color: 0x514b61,
  roughness: 0.96,
  metalness: 0.02,
  flatShading: true,
});

const crystalMaterial = (color: number, emissive = color) => new MeshPhysicalMaterial({
  color,
  emissive,
  emissiveIntensity: 0.42,
  roughness: 0.08,
  metalness: 0.05,
  transmission: 0.34,
  thickness: 0.65,
  ior: 1.9,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  envMapIntensity: 1.6,
  flatShading: true,
});

function namedMesh(name: string, geometry: ConstructorParameters<typeof Mesh>[0], material: ConstructorParameters<typeof Mesh>[1]): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

/** Recenter authored asymmetry without hiding it behind an extra runtime wrapper. */
function centerModel(group: Group): Group {
  group.updateMatrixWorld(true);
  const center = new Box3().setFromObject(group).getCenter(new Vector3());
  for (const child of group.children) child.position.x -= center.x;
  group.userData.collisionRadius = 1.05;
  return group;
}

function classicGeode(): Group {
  const group = new Group();
  group.name = "ClassicGeode";
  const rock = rockMaterial();
  const violet = crystalMaterial(0xb197fc, 0x6f3acb);
  const shell = namedMesh("rockShell", new IcosahedronGeometry(0.98, 1), rock);
  shell.scale.set(1.08, 0.94, 0.72);
  shell.position.z = -0.14;
  group.add(shell);

  const core = namedMesh("violetCore", new OctahedronGeometry(0.58, 1), violet);
  core.position.set(0, 0.03, 0.55);
  core.scale.set(0.9, 1.15, 0.42);
  group.add(core);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const shard = namedMesh(`rimCrystal${i + 1}`, new ConeGeometry(0.14, 0.58, 6), violet);
    shard.position.set(Math.cos(angle) * 0.58, Math.sin(angle) * 0.52, 0.62);
    shard.rotation.z = -angle;
    group.add(shard);
  }
  return centerModel(group);
}

function megaEmerald(): Group {
  const group = new Group();
  group.name = "MegaEmerald";
  const deep = crystalMaterial(0x00a957, 0x006b37);
  const bright = crystalMaterial(0x5dffaf, 0x00b85f);
  const body = namedMesh("emeraldCutBody", new CylinderGeometry(0.78, 0.78, 0.54, 8, 3), deep);
  body.rotation.x = Math.PI / 2;
  body.rotation.z = Math.PI / 8;
  body.scale.set(0.76, 1.16, 1);
  group.add(body);
  const table = namedMesh("emeraldTable", new CylinderGeometry(0.49, 0.6, 0.12, 8), bright);
  table.rotation.x = Math.PI / 2;
  table.rotation.z = Math.PI / 8;
  table.position.z = 0.36;
  table.scale.set(0.76, 1.16, 1);
  group.add(table);
  for (let i = 0; i < 5; i += 1) {
    const sparkle = namedMesh(`emeraldSparkle${i + 1}`, new OctahedronGeometry(i === 0 ? 0.13 : 0.08, 0), bright);
    sparkle.position.set(-0.76 + i * 0.38, i % 2 ? -0.9 : 0.86, 0.28 + i * 0.018);
    sparkle.rotation.z = i * 0.65;
    group.add(sparkle);
  }
  return centerModel(group);
}

function powerRuby(): Group {
  const group = new Group();
  group.name = "PowerRuby";
  const red = crystalMaterial(0xe80d3e, 0x9d001f);
  const hot = crystalMaterial(0xff6681, 0xe41342);
  const body = namedMesh("rubyBrilliantBody", new IcosahedronGeometry(0.83, 2), red);
  body.scale.set(0.94, 1.08, 0.62);
  group.add(body);
  const crown = namedMesh("rubyStarCrown", new DodecahedronGeometry(0.56, 0), hot);
  crown.position.z = 0.5;
  crown.scale.set(1, 1.08, 0.28);
  crown.rotation.z = Math.PI / 4;
  group.add(crown);
  const girdle = namedMesh("rubyGirdle", new TorusGeometry(0.77, 0.055, 5, 24), hot);
  girdle.scale.y = 1.07;
  girdle.position.z = 0.03;
  group.add(girdle);
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2 + 0.3;
    const sparkle = namedMesh(`rubySparkle${i + 1}`, new OctahedronGeometry(i === 1 ? 0.14 : 0.075, 0), hot);
    sparkle.position.set(Math.cos(angle) * 0.92, Math.sin(angle) * 0.94, 0.3);
    sparkle.rotation.z = angle;
    group.add(sparkle);
  }
  return centerModel(group);
}

function superDiamond(): Group {
  const group = new Group();
  group.name = "SuperDiamond";
  const ice = new MeshPhysicalMaterial({
    color: 0xd7f7ff,
    emissive: 0x2f8dc2,
    emissiveIntensity: 0.12,
    roughness: 0.11,
    metalness: 0.02,
    transmission: 0.48,
    thickness: 0.8,
    ior: 2.15,
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    envMapIntensity: 1.9,
    flatShading: true,
  });
  const iceShade = new MeshPhysicalMaterial({
    color: 0x8bdcff,
    emissive: 0x236fa8,
    emissiveIntensity: 0.08,
    roughness: 0.16,
    metalness: 0.04,
    transmission: 0.35,
    thickness: 0.9,
    ior: 2.15,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.8,
    flatShading: true,
  });
  const rainbow = [
    crystalMaterial(0xff8ad8, 0xff4fbd),
    crystalMaterial(0x8dffdd, 0x32d5ff),
    crystalMaterial(0xffef89, 0xffbd3d),
  ];
  const crown = namedMesh("diamondCrown", new CylinderGeometry(0.52, 0.9, 0.5, 10, 2), ice);
  crown.position.y = 0.43;
  crown.rotation.y = Math.PI / 10;
  group.add(crown);
  const pavilion = namedMesh("diamondPavilion", new ConeGeometry(0.9, 1.25, 10, 2), iceShade);
  pavilion.position.y = -0.45;
  pavilion.rotation.y = Math.PI / 10;
  pavilion.rotation.z = Math.PI;
  group.add(pavilion);
  const girdle = namedMesh("diamondGirdle", new TorusGeometry(0.88, 0.035, 5, 30), iceShade);
  girdle.position.set(0, 0.18, 0.08);
  girdle.scale.y = 0.58;
  group.add(girdle);
  const table = namedMesh("diamondTable", new CylinderGeometry(0.5, 0.5, 0.08, 10), ice);
  table.position.y = 0.72;
  table.rotation.y = Math.PI / 10;
  group.add(table);
  const starCore = namedMesh("diamondStarCore", new OctahedronGeometry(0.42, 1), crystalMaterial(0x75ddff, 0x287dff));
  starCore.position.set(0, 0.16, 0.95);
  starCore.scale.set(0.9, 0.72, 0.24);
  starCore.rotation.z = Math.PI / 4;
  group.add(starCore);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const fire = namedMesh(`rainbowFire${i + 1}`, new OctahedronGeometry(i === 0 ? 0.13 : 0.07, 0), rainbow[i % rainbow.length]);
    fire.position.set(Math.cos(angle) * 0.98, Math.sin(angle) * 0.76 + 0.08, 0.18);
    fire.rotation.z = angle;
    group.add(fire);
  }
  return centerModel(group);
}

function dragonheart(): Group {
  const group = new Group();
  group.name = "DragonheartGem";
  const obsidian = new MeshPhysicalMaterial({
    color: 0x120d1c,
    emissive: 0x260b30,
    emissiveIntensity: 0.16,
    roughness: 0.1,
    metalness: 0.5,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const fire = crystalMaterial(0xff553f, 0xff210d);
  const ember = crystalMaterial(0xffc247, 0xff6b12);
  for (const side of [-1, 1]) {
    const lobe = namedMesh(side < 0 ? "leftHeartFacet" : "rightHeartFacet", new SphereGeometry(0.5, 8, 6), fire);
    lobe.position.set(side * 0.3, 0.31, 0.38);
    lobe.scale.set(0.82, 0.78, 0.62);
    group.add(lobe);
    const horn = namedMesh(side < 0 ? "leftObsidianHorn" : "rightObsidianHorn", new ConeGeometry(0.16, 0.72, 5), obsidian);
    horn.position.set(side * 0.7, 0.68, 0.08);
    horn.rotation.z = side * -0.62;
    group.add(horn);
  }
  const point = namedMesh("heartPoint", new ConeGeometry(0.58, 1.05, 7), fire);
  point.position.set(0, -0.4, 0.38);
  point.rotation.z = Math.PI;
  group.add(point);
  const core = namedMesh("emberCore", new OctahedronGeometry(0.3, 1), ember);
  core.position.set(0, 0, 0.78);
  core.scale.set(0.72, 1.1, 0.46);
  group.add(core);
  const guard = namedMesh("obsidianGuard", new TorusGeometry(0.7, 0.085, 5, 24, Math.PI * 1.25), obsidian);
  guard.rotation.z = -0.38;
  guard.position.z = 0.08;
  group.add(guard);
  return centerModel(group);
}

export function buildGemStyle(key: GemStyleKey): Group {
  switch (key) {
    case "gem_emerald": return megaEmerald();
    case "gem_ruby": return powerRuby();
    case "gem_diamond": return superDiamond();
    case "gem_dragonheart": return dragonheart();
    default: return classicGeode();
  }
}
