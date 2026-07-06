export interface Shortcut {
  id: string;
  name: string;
  execPath: string; // File path, web URL, or steam protocol (e.g. steam://run/1091500)
  category: string;  // Group/Use case (e.g. Gaming, Design, Productivity, Utilities)
  tags: string[];    // Keywords for searching
  iconUrl?: string;  // Base64 or image URL
  description?: string; // Quick note or description
  createdAt: number;
  order?: number;     // Order for drag-and-drop manual sorting
}

export interface SuggestionResponse {
  category: string;
  tags: string[];
  description: string;
}
