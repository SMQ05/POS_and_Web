import { HelpCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { downloadCSVTemplate } from '@/lib/csv';

interface ImportHelpProps {
  columns: { key: string; label: string }[];
  templateFilename: string;
  entityName: string;
}

/** Small help-icon popover shown next to the Import button. */
export function ImportHelpPopover({ columns, templateFilename, entityName }: ImportHelpProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600">
          <HelpCircle className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start">
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">How to Import {entityName}</h4>
          <ol className="list-decimal list-inside space-y-1 text-gray-600 text-xs">
            <li>Download the CSV template below</li>
            <li>Fill in the data using a spreadsheet app (Excel, Google Sheets, etc.)</li>
            <li>Save as <strong>.csv</strong> (UTF-8)</li>
            <li>Click the <strong>Import</strong> button and select your file</li>
          </ol>

          <div className="bg-gray-50 rounded-md p-2">
            <p className="text-xs font-medium text-gray-700 mb-1">Required columns:</p>
            <div className="flex flex-wrap gap-1">
              {columns.map((col) => (
                <span key={col.key} className="text-[11px] bg-white border rounded px-1.5 py-0.5">
                  {col.label}
                </span>
              ))}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs"
            onClick={() => downloadCSVTemplate(columns, templateFilename)}
          >
            <Download className="w-3 h-3" />
            Download Template (.csv)
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
