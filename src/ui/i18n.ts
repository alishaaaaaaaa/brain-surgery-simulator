import { events } from '../core/events';

export type Lang = 'en' | 'fr';

const en = {
  'app.title': 'IC-PC Aneurysm Clipping',
  'app.subtitle': 'Educational simulator · Right pterional, transsylvian approach',
  'start.disclaimerTitle': 'Education and demonstration only',
  'start.disclaimer':
    'This simulator is for education and demonstration only. It is not a clinical training device, is not validated for surgical skill assessment, and does not provide medical advice.',
  'start.anatomyNote':
    'Anatomy is simplified and procedurally generated. It does not represent any real patient.',
  'start.button': 'I understand — Start',
  'start.language': 'Language',
  'hud.controls.title': 'Microscope',
  'hud.controls.tilt': 'Right-drag or ⌥ + drag — tilt',
  'hud.controls.pan': 'Shift + drag or arrow keys — move',
  'hud.controls.zoom': 'Wheel or + / − — zoom',
  'hud.controls.labels': 'L — anatomy labels',
  'hud.controls.reset': 'R — reset view',
  'hud.controls.focus': 'Autofocus follows the cursor',
  'hud.zoom': 'ZOOM',
  'hud.focus': 'FOCUS',
  'hud.milestone': 'M2 · instruments — procedure stages arrive in M3',
  'anat.ica': 'Internal carotid artery (ICA)',
  'anat.m1': 'M1 — middle cerebral artery',
  'anat.m2Superior': 'M2 superior trunk',
  'anat.m2Inferior': 'M2 inferior trunk',
  'anat.a1': 'A1 — anterior cerebral artery',
  'anat.pcom': 'Posterior communicating artery (PCom)',
  'anat.acha': 'Anterior choroidal artery (AChA)',
  'anat.opticNerve': 'Optic nerve (CN II)',
  'anat.oculomotorNerve': 'Oculomotor nerve (CN III)',
  'anat.aneurysm': 'IC-PC aneurysm (6.6 mm)',
  'anat.bleb': 'Bleb (thin-walled)',
  'anat.frontalLobe': 'Frontal lobe',
  'anat.temporalLobe': 'Temporal lobe',
  'anat.sylvianFissure': 'Sylvian fissure (opened)',
  'anat.spatula': 'Brain spatula',
  'anat.arachnoid': 'Arachnoid membrane',
  'anat.floor': 'Basal cisterns',
  'hud.controls.tool': 'Left-drag — use the tool in hand',
  'hud.controls.noTool': 'Esc — put the tool down (left-drag then tilts)',
  'hud.controls.tools': '1–0 — pick up a tool',
  'tool.suction': 'Suction',
  'tool.scissors': 'Micro scissors',
  'tool.bipolar': 'Bipolar',
  'tool.dissector': 'Dissector',
  'tool.spatula': 'Spatula',
  'tool.clip': 'Aneurysm clip',
  'tool.icg': 'ICG',
  'tool.doppler': 'Doppler',
  'tool.endoscope': 'Endoscope',
  'tool.tempClip': 'Temp. clip',
  'tool.none': 'No instrument — left-drag tilts the microscope. Press 1–0 to pick one up.',
  'tool.comingSoon': 'M5',
  'hint.suction': 'Hold on pooled fluid to aspirate. Never hold suction on the aneurysm dome.',
  'hint.scissors': 'Click an arachnoid segment to cut it. Sharp dissection only — never cut a vessel or nerve.',
  'hint.bipolar': 'Click to coagulate small bleeding points or pial vessels. Not on major arteries, nerves or the dome.',
  'hint.dissector': 'Stroke along the neck adhesions to free them (proximal and distal side). Keep off the dome.',
  'hint.spatula': 'Drag a blade along the fissure to move it, or away from the fissure to retract more. Retract gently.',
  'hint.clip': 'Aim at the neck. Q/E rotate · [ ] blade depth · C straight/curved. Click to apply; click a clip to remove it.',
  'hint.tempClip': 'Click the proximal ICA to apply a temporary clip (proximal control). Click it again to remove.',
  'hint.icg': 'ICG videoangiography — fluorescence view arrives in M5.',
  'hint.doppler': 'Press the probe on a vessel to hear its flow.',
  'hint.endoscope': 'Endoscopic view behind the aneurysm — arrives in M5.',
  'clip.straight': 'Straight',
  'clip.curved': 'Curved',
  'clip.length': 'Blade',
  'status.rotation': 'rot',
  'status.depth': 'depth',
  'status.retraction': 'Retraction',
  'toast.arachnoidCut': 'Arachnoid cut',
  'toast.adhesionFreed': 'Adhesion freed from the neck',
  'toast.neckFree': 'Neck dissected free on both sides',
  'toast.domeAdhesion': 'Dome adhesion peeled off — this stresses the dome. Leave dome adhesions alone.',
  'toast.domeTouch': 'Careful — you are rubbing the aneurysm dome',
  'toast.blebTouch': 'Stop — the bleb is the weakest point of the dome',
  'toast.suctionDome': 'Do not hold suction on the dome',
  'toast.scissorsDome': 'You cut into the aneurysm wall!',
  'toast.scissorsVessel': 'You cut an artery!',
  'toast.scissorsNerve': 'You cut a cranial nerve!',
  'toast.pialInjury': 'Pial injury — cut the arachnoid, not the brain surface',
  'toast.coagulated': 'Coagulated',
  'toast.bipolarArtery': 'Never coagulate a major artery',
  'toast.bipolarNerve': 'Heat injury to a cranial nerve',
  'toast.bipolarDome': 'Do not coagulate the aneurysm dome',
  'toast.retraction': 'Retraction is high — relax the spatula',
  'toast.clipApplied': 'Clip applied',
  'toast.clipRemoved': 'Clip removed',
  'toast.clipWhere': 'Aim the clip at the aneurysm neck',
  'toast.clipMax': 'Three clips at most — remove one first',
  'toast.tempClipApplied': 'Temporary clip on the ICA — occlusion time is running',
  'toast.tempClipRemoved': 'Temporary clip removed — flow restored',
  'toast.tempClipWhere': 'Temporary clips go on the proximal ICA',
  'toast.tempClipOne': 'A temporary clip is already on',
  'toast.comingM5': 'This instrument is fully available in M5',
} as const;

export type I18nKey = keyof typeof en;

const fr: Record<I18nKey, string> = {
  'app.title': 'Clippage d’anévrisme IC-PC',
  'app.subtitle': 'Simulateur pédagogique · Voie ptérionale droite, transsylvienne',
  'start.disclaimerTitle': 'À visée éducative et de démonstration uniquement',
  'start.disclaimer':
    'Ce simulateur est destiné uniquement à l’enseignement et à la démonstration. Ce n’est pas un outil de formation clinique, il n’est pas validé pour évaluer les compétences chirurgicales et il ne fournit aucun avis médical.',
  'start.anatomyNote':
    'L’anatomie est simplifiée et générée de façon procédurale. Elle ne représente aucun patient réel.',
  'start.button': 'J’ai compris — Commencer',
  'start.language': 'Langue',
  'hud.controls.title': 'Microscope',
  'hud.controls.tilt': 'Clic droit + glisser ou ⌥ + glisser — inclinaison',
  'hud.controls.pan': 'Maj + glisser ou flèches — déplacement',
  'hud.controls.zoom': 'Molette ou + / − — zoom',
  'hud.controls.labels': 'L — étiquettes anatomiques',
  'hud.controls.reset': 'R — réinitialiser la vue',
  'hud.controls.focus': 'La mise au point suit le curseur',
  'hud.zoom': 'ZOOM',
  'hud.focus': 'MAP',
  'hud.milestone': 'M2 · instruments — les étapes de la procédure arrivent en M3',
  'anat.ica': 'Artère carotide interne (ACI)',
  'anat.m1': 'M1 — artère cérébrale moyenne',
  'anat.m2Superior': 'Tronc M2 supérieur',
  'anat.m2Inferior': 'Tronc M2 inférieur',
  'anat.a1': 'A1 — artère cérébrale antérieure',
  'anat.pcom': 'Artère communicante postérieure (AComP)',
  'anat.acha': 'Artère choroïdienne antérieure (AChA)',
  'anat.opticNerve': 'Nerf optique (II)',
  'anat.oculomotorNerve': 'Nerf oculomoteur (III)',
  'anat.aneurysm': 'Anévrisme IC-PC (6,6 mm)',
  'anat.bleb': 'Sac fille (paroi fine)',
  'anat.frontalLobe': 'Lobe frontal',
  'anat.temporalLobe': 'Lobe temporal',
  'anat.sylvianFissure': 'Vallée sylvienne (ouverte)',
  'anat.spatula': 'Spatule cérébrale',
  'anat.arachnoid': 'Membrane arachnoïdienne',
  'anat.floor': 'Citernes de la base',
  'hud.controls.tool': 'Clic gauche + glisser — utiliser l’instrument',
  'hud.controls.noTool': 'Échap — poser l’instrument (le glisser incline alors la vue)',
  'hud.controls.tools': '1–0 — prendre un instrument',
  'tool.suction': 'Aspiration',
  'tool.scissors': 'Micro-ciseaux',
  'tool.bipolar': 'Bipolaire',
  'tool.dissector': 'Dissecteur',
  'tool.spatula': 'Spatule',
  'tool.clip': 'Clip d’anévrisme',
  'tool.icg': 'ICG',
  'tool.doppler': 'Doppler',
  'tool.endoscope': 'Endoscope',
  'tool.tempClip': 'Clip temp.',
  'tool.none': 'Aucun instrument — le glisser incline le microscope. Touches 1–0 pour en prendre un.',
  'tool.comingSoon': 'M5',
  'hint.suction': 'Maintenir sur le liquide pour l’aspirer. Jamais d’aspiration sur le dôme de l’anévrisme.',
  'hint.scissors': 'Cliquer un segment d’arachnoïde pour le couper. Dissection aiguë uniquement — jamais un vaisseau ou un nerf.',
  'hint.bipolar': 'Cliquer pour coaguler de petits points de saignement ou des vaisseaux pie-mériens. Pas les grosses artères, les nerfs ni le dôme.',
  'hint.dissector': 'Frotter le long des adhérences du collet pour les libérer (côtés proximal et distal). Rester à distance du dôme.',
  'hint.spatula': 'Glisser une lame le long de la vallée pour la déplacer, ou en s’éloignant pour rétracter davantage. Rétracter doucement.',
  'hint.clip': 'Viser le collet. Q/E rotation · [ ] profondeur des mors · C droit/courbe. Clic pour appliquer ; clic sur un clip pour le retirer.',
  'hint.tempClip': 'Cliquer l’ACI proximale pour poser un clip temporaire (contrôle proximal). Cliquer à nouveau pour le retirer.',
  'hint.icg': 'Vidéoangiographie ICG — la vue en fluorescence arrive en M5.',
  'hint.doppler': 'Appuyer la sonde sur un vaisseau pour entendre le flux.',
  'hint.endoscope': 'Vue endoscopique derrière l’anévrisme — arrive en M5.',
  'clip.straight': 'Droit',
  'clip.curved': 'Courbe',
  'clip.length': 'Mors',
  'status.rotation': 'rot',
  'status.depth': 'prof.',
  'status.retraction': 'Rétraction',
  'toast.arachnoidCut': 'Arachnoïde coupée',
  'toast.adhesionFreed': 'Adhérence libérée du collet',
  'toast.neckFree': 'Collet libéré des deux côtés',
  'toast.domeAdhesion': 'Adhérence du dôme décollée — cela fragilise le dôme. Laisser les adhérences du dôme.',
  'toast.domeTouch': 'Attention — vous frottez le dôme de l’anévrisme',
  'toast.blebTouch': 'Stop — le sac fille est le point le plus fragile du dôme',
  'toast.suctionDome': 'Ne pas maintenir l’aspiration sur le dôme',
  'toast.scissorsDome': 'Vous avez coupé la paroi de l’anévrisme !',
  'toast.scissorsVessel': 'Vous avez coupé une artère !',
  'toast.scissorsNerve': 'Vous avez coupé un nerf crânien !',
  'toast.pialInjury': 'Lésion pie-mérienne — couper l’arachnoïde, pas la surface du cerveau',
  'toast.coagulated': 'Coagulé',
  'toast.bipolarArtery': 'Ne jamais coaguler une artère majeure',
  'toast.bipolarNerve': 'Lésion thermique d’un nerf crânien',
  'toast.bipolarDome': 'Ne pas coaguler le dôme de l’anévrisme',
  'toast.retraction': 'Rétraction élevée — relâcher la spatule',
  'toast.clipApplied': 'Clip appliqué',
  'toast.clipRemoved': 'Clip retiré',
  'toast.clipWhere': 'Viser le collet de l’anévrisme avec le clip',
  'toast.clipMax': 'Trois clips au maximum — en retirer un d’abord',
  'toast.tempClipApplied': 'Clip temporaire sur l’ACI — le temps d’occlusion court',
  'toast.tempClipRemoved': 'Clip temporaire retiré — flux rétabli',
  'toast.tempClipWhere': 'Les clips temporaires se posent sur l’ACI proximale',
  'toast.tempClipOne': 'Un clip temporaire est déjà en place',
  'toast.comingM5': 'Cet instrument sera pleinement disponible en M5',
};

const dictionaries: Record<Lang, Record<I18nKey, string>> = { en, fr };

let current: Lang = 'en';
try {
  const saved = localStorage.getItem('sim.lang');
  if (saved === 'en' || saved === 'fr') current = saved;
} catch {
  /* storage unavailable — default to English */
}

export const getLang = (): Lang => current;

export function t(key: I18nKey): string {
  return dictionaries[current][key] ?? en[key];
}

/** Switch language and re-translate every element carrying a data-i18n attribute. */
export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem('sim.lang', lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang;
  applyTranslations();
  events.emit('languageChanged', { lang });
}

export function applyTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as I18nKey);
  });
}

export function hasKey(key: string): key is I18nKey {
  return key in en;
}
