/** PNJ de départ. persona = texte envoyé au LLM ; offline = répliques de secours par humeur. */
export const NPC_DEFS = [
  {
    job: "mecano", id: "rico", name: "Rico", look: "rico", role: "mécano", home: "hlm_s", work: "garage", haunt: "bar",
    traits: { sociable: 0.6, greed: 0.8, aggr: 0.3, brave: 0.5 },
    schedule: [[7, "home"], [8, "work"], [12, "food"], [13, "work"], [19, "haunt"], [23, "home"]],
    persona: "Rico, mécano rusé du Garage, endetté auprès du gang de l'Entrepôt. Parle cash, argot léger, aime l'argent et les moteurs.",
  },
  {
    job: "hacker", id: "nova", name: "Nova", look: "nova", role: "hackeuse", home: "hlm_n", work: "bar", haunt: "place",
    traits: { sociable: 0.8, greed: 0.4, aggr: 0.2, brave: 0.6 },
    schedule: [[9, "home"], [11, "haunt"], [14, "work"], [22, "haunt"], [1, "home"]],
    persona: "Nova, hackeuse sarcastique qui traîne au Bar La Faille. Curieuse, vend des infos, déteste les flics.",
  },
  {
    job: "medecin", id: "doc", name: "Doc Ama", look: "doc", role: "médecin", home: "hlm_n", work: "clinique", haunt: "parc",
    traits: { sociable: 0.5, greed: 0.2, aggr: 0.0, brave: 0.3 },
    schedule: [[6, "home"], [7, "work"], [13, "food"], [14, "work"], [20, "haunt"], [22, "home"]],
    persona: "Docteure Ama, médecin calme et fatiguée de la Clinique Néon. Soigne tout le monde, manque de matériel médical.",
  },
  {
    job: "docker", gang: true, id: "brute", name: "Kross", look: "brute", role: "gros bras", home: "entrepot", work: "entrepot", haunt: "place",
    traits: { sociable: 0.3, greed: 0.7, aggr: 0.9, brave: 0.9 },
    schedule: [[10, "home"], [12, "haunt"], [18, "work"], [3, "home"]],
    persona: "Kross, gros bras du gang de l'Entrepôt. Menaçant, susceptible, respecte la force. Racket les commerçants.",
  },
  {
    job: "marchand", id: "vendor", name: "Mama Sol", look: "vendor", role: "marchande", home: "hlm_s", work: "marche", haunt: "parc",
    traits: { sociable: 0.9, greed: 0.5, aggr: 0.1, brave: 0.4 },
    schedule: [[5, "home"], [6, "work"], [15, "haunt"], [18, "work"], [21, "home"]],
    persona: "Mama Sol, marchande chaleureuse du Marché couvert. Bavarde, maternelle, connaît tous les ragots du quartier.",
  },
  {
    job: "flic", id: "cop", name: "Lt. Varga", look: "cop", role: "flic", home: "hlm_s", work: "commissariat", haunt: "place",
    traits: { sociable: 0.4, greed: 0.3, aggr: 0.6, brave: 0.8 },
    schedule: [[6, "home"], [7, "work"], [12, "haunt"], [14, "work"], [21, "home"]],
    persona: "Lieutenant Varga, flic intègre mais usé du Commissariat. Méfiant envers les nouveaux, veut faire tomber le gang de l'Entrepôt.",
  },
  {
    job: "jardinier", id: "ghost", name: "Spectre", look: "ghost", role: "informateur", home: "entrepot", work: "parc", haunt: "bar",
    traits: { sociable: 0.2, greed: 0.6, aggr: 0.4, brave: 0.2 },
    schedule: [[4, "home"], [14, "work"], [20, "haunt"], [2, "home"]],
    persona: "Spectre, informateur paranoïaque en capuche. Parle par énigmes courtes, vend des secrets, fuit au moindre danger.",
  },
  {
    job: "docker", id: "vex", name: "Vex", look: "thug", role: "gros bras", home: "entrepot", work: "entrepot", haunt: "bar", gang: true,
    traits: { sociable: 0.4, greed: 0.8, aggr: 0.8, brave: 0.7 },
    schedule: [[11, "home"], [13, "haunt"], [18, "work"], [4, "home"]],
    persona: "Vex, bras droit de Kross au gang de l'Entrepôt. Rieur et cruel, ne se bat jamais seul : il appelle toujours Kross.",
  },
  {
    job: "barman", id: "jun", name: "Jun", look: "vendor", role: "barman", home: "hlm_n", work: "bar", haunt: "parc",
    traits: { sociable: 0.9, greed: 0.3, aggr: 0.1, brave: 0.5 },
    schedule: [[8, "home"], [12, "haunt"], [16, "work"], [2, "home"]],
    persona: "Jun, barman du Bar La Faille, ancien lutteur de la Ligue Amateur. Calme, conseille les jeunes combattants.",
  },
];

/** Répliques offline (fallback quand aucune IA distante n'est joignable). Clés : intention. */
export const OFFLINE_LINES = {
  greet: {
    calme: ["Salut, étranger.", "Ouais ?", "On se connaît ?"],
    joyeux: ["Hé, te revoilà !", "Content de te voir dans le coin.", "Ah, mon pote !"],
    "méfiant": ["Qu'est-ce que tu veux, toi ?", "Garde tes distances.", "Je t'ai à l'œil."],
    "énervé": ["Dégage.", "Pas aujourd'hui.", "Tu cherches les ennuis ?"],
    "effrayé": ["S-s'il te plaît, laisse-moi...", "J'ai rien vu, j'ai rien dit !"],
  },
  need: {
    faim: ["J'ai l'estomac dans les talons.", "Je crève de faim, là."],
    energie: ["Je tiens plus debout.", "Faut que je dorme."],
    social: ["Personne ne me parle dans ce quartier.", "Ça fait du bien de causer."],
    argent: ["Je suis à sec.", "Les fins de mois commencent le 3, ici."],
  },
  job: ["J'aurais peut-être un truc pour toi.", "T'as l'air débrouillard. Écoute ça."],
  nojob: ["Rien pour toi pour l'instant.", "Repasse plus tard."],
  rumor: [
    "Paraît que l'Entrepôt cache plus que des caisses.",
    "Varga traîne sur la Place à midi. Évite-le si t'as des trucs à cacher.",
    "La Doc manque de matos depuis le dernier raid.",
    "Kross rackette le marché tous les soirs.",
  ],
  threat: {
    weak: ["D'accord, d'accord ! Calme-toi !", "Pas la peine de s'énerver..."],
    strong: ["Tu me menaces ? Viens voir.", "Mauvaise idée, l'ami."],
  },
  bye: ["À plus.", "Fais gaffe à toi.", "Ouais, c'est ça."],
};
