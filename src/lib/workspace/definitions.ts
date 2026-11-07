// A workspace is a simulated folder. Its files are this fixed list: a request can only ever name a
// key from it, so no client value reaches a filesystem path, and "delete" only records progress.

export type WorkspaceFileKind =
  | 'pdf'
  | 'csv'
  | 'json'
  | 'text'
  | 'image'
  | 'hex' // an image, with its raw bytes
  | 'exif' // an image, with its metadata
  | 'sqlite'
  | 'pcap';

export type WorkspaceTool = 'tiles' | 'messages' | 'tracker';

export type WorkspaceFile = {
  key: string;
  kind: WorkspaceFileKind;
  contentType: string;
  deletable?: boolean;
  // Deleting this file unlocks the question with this number, for the team that deleted it.
  unlocksQuestion?: number;
};

export type Workspace = {
  title: string;
  intro: string;
  tool?: WorkspaceTool;
  files: WorkspaceFile[];
};

const TEXT = 'text/plain; charset=utf-8';
const BINARY = 'application/octet-stream';

const text = (key: string): WorkspaceFile => ({ key, kind: 'text', contentType: TEXT });
const csv = (key: string): WorkspaceFile => ({ key, kind: 'csv', contentType: TEXT });
const db = (key: string): WorkspaceFile => ({ key, kind: 'sqlite', contentType: BINARY });
const jpeg = (key: string, kind: WorkspaceFileKind = 'exif'): WorkspaceFile => ({
  key,
  kind,
  contentType: 'image/jpeg',
});
const png = (key: string): WorkspaceFile => ({ key, kind: 'image', contentType: 'image/png' });

export const WORKSPACES: Record<string, Workspace> = {
  'mj-archive': {
    title: 'The MJ Archive',
    intro:
      'Investigate MJ’s recovered files, uncover the truth behind article NY-204, and discover what she left hidden in the archive.',
    files: [
      { key: 'MJ_Newspaper.pdf', kind: 'pdf', contentType: 'application/pdf' },
      csv('archive_access.csv'),
      { key: 'revision_history.json', kind: 'json', contentType: TEXT },
      text('authentication.log'),
      text('editor_notes.txt'),
      jpeg('photo_01.jpg', 'image'),
      jpeg('photo_02.jpg', 'image'),
      { ...text('old_draft.tmp'), deletable: true },
      { ...text('mj_cache.tmp'), deletable: true, unlocksQuestion: 9 },
    ],
  },
  'q2-oscorp': {
    title: 'Oscorp access records',
    intro: 'What Harry pulled from the Oscorp network.',
    files: [
      text('oscorp_access_report.txt'),
      text('login_history.log'),
      text('firewall.log'),
      text('known_devices.txt'),
    ],
  },
  'q3-bugle': {
    title: 'Bugle submission',
    intro: 'The file as it reached the photo desk.',
    files: [jpeg('eddie_brock_submission.jpg', 'hex')],
  },
  'q4-evidence': {
    title: 'Salvaged fragments',
    intro: 'Every piece MJ recovered, in no useful order.',
    tool: 'tiles',
    files: [1, 2, 3, 4, 5, 6].map((n) => png(`evidence_fragment_${n}.png`)),
  },
  'q6-contact': {
    title: 'MJ’s contact trail',
    intro: 'Her note, the torn contact card and the chats that survived.',
    tool: 'messages',
    files: [
      text('mj_message_note.txt'),
      text('contact_fragment_A.txt'),
      text('contact_fragment_B.txt'),
      text('recovered_messages.txt'),
    ],
  },
  'q7-connors': {
    title: 'Connors’ research files',
    intro: 'The research database, its audit trail and Gwen’s note.',
    files: [text('gwen_research_note.txt'), db('connors_research.db'), text('project_audit.log')],
  },
  'q8-sightings': {
    title: 'Sighting evidence',
    intro: 'The tracker’s data and every photograph it holds.',
    tool: 'tracker',
    files: [
      csv('sightings.csv'),
      text('tracker_ticker.txt'),
      ...[1, 2, 3, 4, 5, 6].map((n) => jpeg(`sighting_photo_0${n}.jpg`)),
    ],
  },
  'q9-capture': {
    title: 'Aaron’s capture',
    intro: 'The capture opens in the packet viewer below. No install needed.',
    files: [
      text('investigation_note.txt'),
      { key: 'network_capture.pcapng', kind: 'pcap', contentType: BINARY },
      text('network_timeline.txt'),
      text('known_servers.txt'),
      text('intercepted_packets.txt'),
    ],
  },
  'q10-cameras': {
    title: 'Jefferson’s case file',
    intro: 'Camera logs from all three sites, the registry and the sign-in history.',
    files: [
      text('jefferson_case_note.txt'),
      text('location_A.log'),
      text('location_B.log'),
      text('location_C.log'),
      csv('device_registry.csv'),
      text('authentication_history.log'),
    ],
  },
  'q11-specimen': {
    title: 'Containment records',
    intro: 'Everything logged about the specimens.',
    files: [
      text('research_note.txt'),
      jpeg('specimen_image.jpg', 'image'),
      csv('sample_metadata.csv'),
      text('observation_log.txt'),
      db('specimen_database.db'),
    ],
  },
  'q12-archive': {
    title: 'Miles’ archive',
    intro: 'What the dimensional archive still holds.',
    files: [
      text('miles_research_note.txt'),
      text('event_timeline.log'),
      csv('portal_readings.csv'),
      text('sensor_calibration.txt'),
      text('corrupted_signature.txt'),
      db('dimensional_records.db'),
    ],
  },
  'q13-tracker': {
    title: 'Ned’s tracker data',
    intro: 'Ned’s note and the observatory data. Six beacons, six flags.',
    files: [
      text('ned_search_note.txt'),
      csv('observatory_stations.csv'),
      csv('tracker_observations.csv'),
      csv('signal_readings.csv'),
    ],
  },
};

export function findWorkspaceFile(workspace: string, key: string): WorkspaceFile | undefined {
  return Object.hasOwn(WORKSPACES, workspace)
    ? WORKSPACES[workspace].files.find((file) => file.key === key)
    : undefined;
}

// Splits simple evidence CSVs: no quoted fields, since these files are ours. A leading # line is a
// comment for the reader, kept out of the table.
export function parseCsv(input: string): string[][] {
  return input
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => line.split(',').map((cell) => cell.trim()));
}
