-- Private document bucket: 25 MB per file, common business file types only.
update storage.buckets
   set file_size_limit = 26214400,
       allowed_mime_types = array[
         'application/pdf',
         'image/png','image/jpeg','image/webp','image/gif',
         'video/mp4','video/quicktime',
         'application/zip','application/x-zip-compressed',
         'application/msword','application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'text/plain','text/csv'
       ]
 where id = 'documents';
