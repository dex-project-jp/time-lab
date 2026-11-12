'use strict';

const PhotoRemoval = (() => {
  const values = row => JSON.stringify([row.times,row.am,row.pm,row.note]);

  function link(row,photoId) {
    if (!row.manualPhotoEdit && !row.history?.length) {
      row.photoImport = {id:photoId,values:values(row)};
    }
  }

  function protect(row) {
    row.manualPhotoEdit = true;
    delete row.photoImport;
  }

  function plan(state,employeeId,month,photoId) {
    const bucket = state.months[employeeId+':'+month];
    const photo = bucket?.images.find(image=>image.id===photoId);
    if (!photo) throw Error('対象の写真が見つかりません。');
    const peers = bucket.images.filter(image=>image.id!==photoId);
    const rows = [], kept = [];
    for (const [day,row] of Object.entries(bucket.rows)) {
      if (!row.sourceIds?.includes(photoId)) continue;
      const overlap = peers.some(image=>image.references?.[day] ||
        [image.localCandidates,image.chappyCandidates].some(candidates=>Array.isArray(candidates) &&
          candidates.some(candidate=>Number(candidate.day)===Number(day))));
      const detail = {day,date:month+'-'+day.padStart(2,'0'),times:[...row.times]};
      if (row.sourceIds.length===1 && row.photoImport?.id===photoId && row.photoImport.values===values(row)
          && !row.manualPhotoEdit && !row.history?.length && !overlap) rows.push(detail);
      else kept.push(detail);
    }
    return {photo,rows,kept};
  }

  function remove(state,employeeId,month,photoId,includeRows) {
    const result = plan(state,employeeId,month,photoId);
    const bucket = state.months[employeeId+':'+month];
    bucket.images = bucket.images.filter(image=>image.id!==photoId);
    for (const [key,pair] of Object.entries(state.photoSets ?? {})) {
      if (!key.startsWith(employeeId+':')) continue;
      for (const half of ['first','second']) {
        if (pair[half]?.month===month && pair[half].id===photoId) delete pair[half];
      }
    }
    if (includeRows) for (const row of result.rows) delete bucket.rows[row.day];
    return result;
  }

  function salaryMonth(date) {
    const month = date.slice(0,7);
    if (Number(date.slice(8,10))<=15) return month;
    const [year,number] = month.split('-').map(Number);
    return new Date(Date.UTC(year,number,1)).toISOString().slice(0,7);
  }

  return {link,protect,plan,remove,salaryMonth};
})();
if (typeof module!=='undefined') module.exports = PhotoRemoval;
