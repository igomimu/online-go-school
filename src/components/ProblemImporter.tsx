import { useCallback, useRef } from 'react';
import type { Problem } from '../types/problem';
import { parseSGFTree } from '../utils/sgfUtils';
import { createEmptyBoard } from '../utils/gameLogic';
import { Upload } from 'lucide-react';
import type { StoneColor } from './GoBoard';

interface ProblemImporterProps {
  onImport: (problems: Problem[]) => void;
}

export default function ProblemImporter({ onImport }: ProblemImporterProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const parseSgfToProblem = useCallback((sgfContent: string, fileName: string): Problem | null => {
    try {
      const parsed = parseSGFTree(sgfContent);
      const root = parsed.root;

      // Determine the initial board state from setup stones
      const boardSize = parsed.size || 19;
      let initialBoard = parsed.board || createEmptyBoard(boardSize);

      // Determine correct color: first move's color in the tree
      let correctColor: StoneColor = 'BLACK';
      if (root.children.length > 0 && root.children[0].move) {
        correctColor = root.children[0].move.color;
      }

      const title = parsed.metadata?.gameName || parsed.metadata?.event || fileName.replace(/\.sgf$/i, '') || '詰碁';

      return {
        id: crypto.randomUUID(),
        title,
        boardSize,
        initialBoard,
        correctColor,
        sgfTree: root,
        difficulty: undefined,
        createdAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error('SGF parse error:', err);
      return null;
    }
  }, []);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const problems: Problem[] = [];
    let remaining = files.length;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (content) {
          const problem = parseSgfToProblem(content, file.name);
          if (problem) problems.push(problem);
        }
        remaining--;
        if (remaining === 0 && problems.length > 0) {
          onImport(problems);
        }
      };
      reader.readAsText(file);
    });
  }, [parseSgfToProblem, onImport]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      className="border-2 border-dashed border-white/10 rounded-lg p-4 text-center hover:border-blue-500/30 transition-colors cursor-pointer"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => fileRef.current?.click()}
    >
      <Upload className="w-6 h-6 mx-auto mb-2 text-zinc-600" />
      <div className="text-sm text-zinc-500">SGFファイルをドラッグ&ドロップ</div>
      <div className="text-xs text-zinc-700 mt-1">またはクリックして選択</div>
      <input
        ref={fileRef}
        type="file"
        accept=".sgf"
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
