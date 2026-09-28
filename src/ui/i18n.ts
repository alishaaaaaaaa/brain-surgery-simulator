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
  'hud.controls.tilt': 'Right-drag or Alt/⌥ + drag — tilt',
  'hud.controls.pan': 'Shift + drag or arrow keys — move',
  'hud.controls.zoom': 'Wheel or + / − — zoom',
  'hud.controls.labels': 'L — anatomy labels',
  'hud.controls.reset': 'R — reset view',
  'hud.controls.focus': 'Autofocus follows the cursor',
  'hud.zoom': 'ZOOM',
  'hud.focus': 'FOCUS',
  'hud.milestone': 'M1 · scene preview — tools arrive in M2',
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
  'hud.controls.tilt': 'Clic droit + glisser ou Alt/⌥ + glisser — inclinaison',
  'hud.controls.pan': 'Maj + glisser ou flèches — déplacement',
  'hud.controls.zoom': 'Molette ou + / − — zoom',
  'hud.controls.labels': 'L — étiquettes anatomiques',
  'hud.controls.reset': 'R — réinitialiser la vue',
  'hud.controls.focus': 'La mise au point suit le curseur',
  'hud.zoom': 'ZOOM',
  'hud.focus': 'MAP',
  'hud.milestone': 'M1 · aperçu de la scène — les instruments arrivent en M2',
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
