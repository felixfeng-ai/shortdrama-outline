export interface SystemVoice {
  id: string
  providerId: "system"
  label: string
  description: string
}

export interface ProjectVoiceCharacter {
  id: string
  name: string
}

export interface VoiceProfile {
  id: string
  projectId: string
  characterEntityId: string
  providerId: "system"
  voiceId: string
  label: string
  speed: number
  volume: number
  createdAt: number
  updatedAt: number
}
