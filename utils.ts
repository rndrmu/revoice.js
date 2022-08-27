
const HTTP_REGEX = /^https?:\/\//;
const YOUTUBE_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
const HTTP_MP3_STREAM = /^https?:\/\/.*\.mp3$/;

export enum LinkType {
    YOUTUBE,
    MP3,
}

export function inputIsValidLink(link: string) {
    return HTTP_MP3_STREAM.test(link) || YOUTUBE_REGEX.test(link);
}