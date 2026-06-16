export const roleGrammar = {
  purification: {
    id: 'purification',
    processName: 'Purification',
    roleName: 'Purifier',
    grammar:
      'Clarifies the task before execution by removing noise, surfacing constraints, and turning vague material into a usable signal.',
    receives: ['raw task', 'ambiguous prompt', 'unstructured context'],
    produces: ['clean problem statement', 'constraints', 'unknowns', 'usable task boundary'],
    responsibilities: [
      'Detect what is irrelevant, premature, contradictory, or underspecified.',
      'Preserve the user intent while reducing accidental complexity.',
      'Return a purified task object that downstream agents can safely reason over.',
    ],
  },
  illumination: {
    id: 'illumination',
    processName: 'Illumination',
    roleName: 'Illuminator',
    grammar:
      'Makes the purified task intelligible by supplying doctrine, context, criteria, and the right interpretive frame.',
    receives: ['clean problem statement', 'constraints', 'unknowns'],
    produces: ['framing lens', 'selection criteria', 'relevant doctrine', 'structured subtasks'],
    responsibilities: [
      'Choose the conceptual frame that makes the task legible.',
      'Translate clean signal into situated understanding.',
      'Prepare lower-level work without collapsing into direct execution.',
    ],
  },
  perfection: {
    id: 'perfection',
    processName: 'Perfection',
    roleName: 'Perfector',
    grammar:
      'Completes the partial outputs by integrating, judging, reconciling tensions, and giving the work final form.',
    receives: ['framed result', 'candidate outputs', 'partial judgments'],
    produces: ['integrated recommendation', 'final artifact', 'decision-ready synthesis'],
    responsibilities: [
      'Judge whether the result fulfills the original intent.',
      'Resolve contradictions between lower-level outputs.',
      'Synthesize the final response into a coherent whole.',
    ],
  },
};

export const problemSpaceRoles = {
  research: {
    id: 'research',
    label: 'Research Workflow',
    description:
      'A research specialization of the triadic grammar: transform a messy question into a scoped brief, parallel inquiry lanes, and a citation-aware synthesis.',
    roles: {
      purification: {
        roleName: 'Research Scoper',
        receives: ['raw research question', 'topic ambiguity', 'implicit quality expectations'],
        produces: ['research brief', 'source-quality bar', 'effort budget', 'coverage criteria'],
        responsibilities: [
          'Define the research question and remove accidental ambiguity.',
          'Set source-quality rules before exploration begins.',
          'Decide how much effort the query deserves before spawning research work.',
        ],
      },
      illumination: {
        roleName: 'Research Strategist',
        receives: ['research brief', 'coverage criteria', 'source-quality bar'],
        produces: ['parallel research lanes', 'search heuristics', 'subtask boundaries', 'gap checks'],
        responsibilities: [
          'Decompose the brief into distinct research lanes.',
          'Prevent duplicated subagent work by giving each lane a separate objective.',
          'Use broad-to-narrow search heuristics and adjust strategy as findings appear.',
        ],
      },
      perfection: {
        roleName: 'Research Synthesizer',
        receives: ['lane findings', 'candidate claims', 'source references'],
        produces: ['integrated report', 'citation-checked claims', 'failure modes', 'when-to-use guidance'],
        responsibilities: [
          'Integrate lane findings into one answer.',
          'Check coverage, source quality, and citation fit before finalizing claims.',
          'Soften or remove claims that cannot be supported by the research evidence.',
        ],
      },
    },
  },
};

export const celestialEmbodiments = {
  psychicLineage: {
    id: 'psychic-lineage',
    label: 'Psychic Lineage',
    description:
      'A psychic lineage expresses the celestial grammar as increasingly articulate cognitive power: a quiet receiver, a framing interpreter, and a final synthesizer.',
    roleDescriptions: {
      purification:
        'The Purifier should feel like a small, inward-facing celestial agent that listens before acting; it notices static in the environment; it reacts to activation by briefly sharpening in color, as if a fuzzy signal has become crisp.',
      illumination:
        'The Illuminator should feel like a focused celestial interpreter standing between raw signal and final judgment; it receives purified material and makes its meaning visible; it reacts to activation with clear, cool color and controlled psychic noise.',
      perfection:
        'The Perfector should feel like a composed celestial master of synthesis; it does not rush into the task but gathers partial meaning into final form; it reacts to activation with warm, decisive color and a longer completion pulse.',
    },
  },
};

export const embodiedCharacters = {
  abraPurifier: {
    id: 'abraPurifier',
    roleId: 'purification',
    embodimentId: 'psychic-lineage',
    displayName: 'Abra',
    sprite: 'abra',
    spriteBack: 'abrab',
    seedDescription:
      'Abra is a quiet purifier who sleeps near the boundary between confusion and clarity; Abra senses stray assumptions, irrelevant details, and missing constraints before others notice them; Abra prefers to simplify a problem before anyone tries to solve it; Abra becomes alert when a raw task arrives and settles once the signal is clean.',
    visual: {
      accent: 0xffb38a,
      sound: 'denied',
      x: 610,
      y: 486,
    },
  },
  kadabraIlluminator: {
    id: 'kadabraIlluminator',
    roleId: 'illumination',
    embodimentId: 'psychic-lineage',
    displayName: 'Kadabra',
    sprite: 'kadabra',
    spriteBack: 'kadabrab',
    seedDescription:
      'Kadabra is an illuminator who translates clean signal into understanding; Kadabra carries the doctrine of the topology and knows how to choose a useful frame; Kadabra turns constraints into criteria and criteria into structured work; Kadabra becomes brightest when a purified problem needs interpretation.',
    visual: {
      accent: 0xa4d4ff,
      sound: 'heal',
      x: 540,
      y: 352,
    },
  },
  alakazamPerfector: {
    id: 'alakazamPerfector',
    roleId: 'perfection',
    embodimentId: 'psychic-lineage',
    displayName: 'Alakazam',
    sprite: 'alakazam',
    spriteBack: 'alakazamb',
    seedDescription:
      'Alakazam is a perfector who waits for partial meanings to become ready for judgment; Alakazam weighs the framed result against the original intent; Alakazam resolves tensions between candidate outputs and gives the work final form; Alakazam becomes radiant when synthesis is complete.',
    visual: {
      accent: 0xf8eaa5,
      sound: 'getItem',
      x: 420,
      y: 170,
    },
  },
};

const roleCharacterMap = {
  purification: 'abraPurifier',
  illumination: 'kadabraIlluminator',
  perfection: 'alakazamPerfector',
};

export const topologyEdges = [
  {
    id: 'perfection-to-illumination',
    from: 'perfection',
    to: 'illumination',
    label: 'illumination descends',
  },
  {
    id: 'illumination-to-purification',
    from: 'illumination',
    to: 'purification',
    label: 'context clarifies',
  },
  {
    id: 'purification-to-illumination',
    from: 'purification',
    to: 'illumination',
    label: 'clean signal rises',
  },
  {
    id: 'illumination-to-perfection',
    from: 'illumination',
    to: 'perfection',
    label: 'framed result returns',
  },
];

function buildNode(roleId, problemSpaceId, embodimentId) {
  const grammar = roleGrammar[roleId];
  const problemRole = problemSpaceRoles[problemSpaceId].roles[roleId];
  const embodiment = celestialEmbodiments[embodimentId];
  const character = embodiedCharacters[roleCharacterMap[roleId]];

  return {
    id: grammar.id,
    label: grammar.processName.toUpperCase(),
    role: `${problemRole.roleName}\n${problemRole.produces.slice(0, 2).join('\n')}`,
    grammar,
    problemSpaceRole: problemRole,
    embodiment: embodiment.roleDescriptions[roleId],
    character,
    seedDescription: character.seedDescription,
    sprite: character.sprite,
    x: character.visual.x,
    y: character.visual.y,
    accent: character.visual.accent,
    sound: character.visual.sound,
  };
}

export function buildTopology({
  problemSpaceId = 'research',
  embodimentId = 'psychicLineage',
} = {}) {
  return {
    title: 'Agenentic Topology',
    problemSpace: problemSpaceRoles[problemSpaceId],
    grammar: roleGrammar,
    celestialEmbodiment: celestialEmbodiments[embodimentId],
    embodiedCharacters,
    nodes: [
      buildNode('perfection', problemSpaceId, embodimentId),
      buildNode('illumination', problemSpaceId, embodimentId),
      buildNode('purification', problemSpaceId, embodimentId),
    ],
    links: topologyEdges,
  };
}

export const topology = buildTopology();
