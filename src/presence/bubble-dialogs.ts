export type BubbleType =
  | 'THINKING'
  | 'WAITING'
  | 'PRAYING'
  | 'RESTING'
  | 'STANDUP'
  | 'TOILET'
  | 'IDLE'
  | 'OFFLINE';

const WORKING_DIALOGS = [
  'Lagi fokus ngerjain tugas nih...',
  'Bentar, lagi mikir arsitekturnya...',
  'Ngetik dulu, jangan diganggu ya...',
  'Sedang memproses solusi terbaik...',
];

const WAITING_DIALOGS = [
  'Aku lagi nungguin tugas dari PM nih...',
  'Nunggu dependensi tugas sebelumnya kelar dulu...',
  'Lagi nunggu review dari QA tester nih...',
  'Standby nunggu info lanjutan dari owner...',
];

const RESTING_DIALOGS = [
  'Laper, makan siang dulu di lapangan...',
  'Santai bentar di lapangan biar fresh...',
  'Bosen di meja, pengen cari angin keluar bentar...',
  'Ngobrol santai dulu sama rekan tim di lapangan...',
];

const PRAYING_DIALOGS = [
  'Waktunya sholat dulu di mushola...',
  'Rehat sejenak, ibadah dulu di mushola...',
  'Tenangkan pikiran dan hati di mushola...',
];

const STANDUP_DIALOGS = [
  'Lagi apel pagi bareng tim dan Dewi (PM)...',
  'Standup meeting pagi: sinkronisasi rencana hari ini...',
];

const TOILET_DIALOGS = [
  'Izin ke toilet bentar ya...',
  'Cuci muka dulu di wastafel toilet...',
  'Bentar, ke toilet dulu...',
];

const IDLE_DIALOGS = [
  'Belum ada tugas baru, nyruput kopi dulu deh...',
  'Standby di meja, siap menerima instruksi berikutnya...',
  'Buka-buka dokumentasi sambil nunggu task baru...',
];

const OFFLINE_DIALOGS = [
  'Zzz... kantor udah tutup, istirahat dulu ya...',
  'Sampai jumpa besok pagi di kantor AI!',
  'Mode istirahat malam aktif...',
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateBubbleDialog(
  status: string,
  options?: {
    taskTitle?: string;
    blockName?: string;
  },
): { bubbleText: string; bubbleType: BubbleType } {
  const normStatus = status.toUpperCase();

  switch (normStatus) {
    case 'WORKING':
    case 'RUNNING':
      return {
        bubbleText: options?.taskTitle
          ? `Lagi ngerjain: "${options.taskTitle.slice(0, 45)}" nih...`
          : pickRandom(WORKING_DIALOGS),
        bubbleType: 'THINKING',
      };

    case 'BLOCKED':
    case 'WAITING':
    case 'REVIEW':
      return {
        bubbleText: pickRandom(WAITING_DIALOGS),
        bubbleType: 'WAITING',
      };

    case 'PRAYING':
      return {
        bubbleText: options?.blockName
          ? `Waktunya ${options.blockName} di mushola...`
          : pickRandom(PRAYING_DIALOGS),
        bubbleType: 'PRAYING',
      };

    case 'RESTING':
      return {
        bubbleText: options?.blockName
          ? `Waktunya ${options.blockName} di lapangan...`
          : pickRandom(RESTING_DIALOGS),
        bubbleType: 'RESTING',
      };

    case 'STANDUP':
      return {
        bubbleText: pickRandom(STANDUP_DIALOGS),
        bubbleType: 'STANDUP',
      };

    case 'TOILET':
      return {
        bubbleText: pickRandom(TOILET_DIALOGS),
        bubbleType: 'TOILET',
      };

    case 'OFFLINE':
    case 'CLOSED':
      return {
        bubbleText: pickRandom(OFFLINE_DIALOGS),
        bubbleType: 'OFFLINE',
      };

    case 'IDLE':
    default:
      return {
        bubbleText: pickRandom(IDLE_DIALOGS),
        bubbleType: 'IDLE',
      };
  }
}
