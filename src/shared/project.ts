export type Project = {
  id: string
  name: string
  folder: string
  instructions: string
}

export interface ProjectInput {
  id?: string
  name: string
  instructions: string
  chooseFolder: boolean
}

export type ProjectEntry = { name: string; kind: 'directory' | 'file'; previewable: boolean }
export type ProjectListing = { entries: ProjectEntry[]; truncated: boolean }

export type ProjectAttachment = { projectId: string; folder: string; parts: string[] }
