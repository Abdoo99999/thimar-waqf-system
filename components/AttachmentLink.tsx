import React from 'react';
import { Download } from 'lucide-react';
import { InstitutionDocument } from '../types';
import { fileUrl } from '../services/db';

export const ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv';

const AttachmentLink: React.FC<{ doc: InstitutionDocument }> = ({ doc }) => (
  <span className="inline-flex flex-wrap items-center gap-2 min-w-0">
    {doc.file_id ? (
      <>
        <a href={fileUrl(doc.file_id)} target="_blank" rel="noopener" className="text-blue-700 underline break-all">
          {doc.name}
        </a>
        <a href={fileUrl(doc.file_id, true)} target="_blank" rel="noopener" aria-label={`تنزيل ${doc.name}`} title="تنزيل الملف" className="text-blue-700 shrink-0">
          <Download size={16} />
        </a>
      </>
    ) : (
      <>
        <span className="break-all">{doc.name}</span>
        <span className="text-xs text-orange-600">لم يُحفظ الملف — يرجى إعادة الرفع</span>
      </>
    )}
  </span>
);

export default AttachmentLink;
