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
