import axios from 'axios'
import { basename } from 'path'
import { v5 as uuidv5 } from 'uuid'

import { MediaType } from '../types'

if ((process.env.SIRV_CLIENT_ID_RO ?? null) == null && typeof window === 'undefined') throw new Error('SIRV_CLIENT_ID_RO not set')
if ((process.env.SIRV_CLIENT_SECRET_RO ?? null) == null && typeof window === 'undefined') throw new Error('SIRV_CLIENT_SECRET_RO not set')
if ((process.env.NEXT_PUBLIC_SIRV_BASE_URL ?? null) == null) throw new Error('NEXT_PUBLIC_SIRV_BASE_URL not set')

export const SIRV_CONFIG = {
  clientId: process.env.SIRV_CLIENT_ID_RO ?? null,
  clientSecret: process.env.SIRV_CLIENT_SECRET_RO ?? null,
  clientAdminId: process.env.SIRV_CLIENT_ID_RW ?? null,
  clientAdminSecret: process.env.SIRV_CLIENT_SECRET_RW ?? null,
  baseUrl: process.env.NEXT_PUBLIC_SIRV_BASE_URL ?? ''
}

export const userHomeFromUuid = (uuid: string): string => `${SIRV_CONFIG.baseUrl}/u/${uuid}`

const client = axios.create({
  baseURL: 'https://api.sirv.com/v2',
  headers: {
    'content-type': 'application/json'
  }
})

const headers = {
  'content-type': 'application/json'
}

interface TokenParamsType {
  clientId: string | null
  clientSecret: string | null
}

const _validateTokenParams = ({ clientId, clientSecret }: TokenParamsType): boolean =>
  clientId != null && clientSecret != null

export const getToken = async (isAdmin: boolean = false): Promise<string|undefined> => {
  const params: TokenParamsType = isAdmin
    ? {
        clientId: SIRV_CONFIG.clientAdminId,
        clientSecret: SIRV_CONFIG.clientAdminSecret
      }
    : {
        clientId: SIRV_CONFIG.clientId,
        clientSecret: SIRV_CONFIG.clientSecret
      }

  if (!_validateTokenParams(params)) {
    console.log('Missing client token/secret')
    return undefined
  }
  const res = await client.post(
    '/token',
    params)

  if (res.status === 200) {
    return res.data.token
  }
  throw new Error('Sirv API.getToken() error' + res.statusText)
}

export const getAdminToken = async (): Promise<string|undefined> => await getToken(true)

const getAdminTokenIfNotExist = async (token?: string): Promise<string> => {
  if (token != null) return token

  const _t = await getAdminToken()

  if (_t == null) {
    throw new Error('Sirv API.getUserImages(): unable to get a token')
  }
  return _t
}

const getTokenIfNotExist = async (token?: string): Promise<string> => {
  if (token != null) return token

  const _t = await getToken()

  if (_t == null) {
    throw new Error('Sirv API.getUserImages(): unable to get a token')
  }
  return _t
}

export interface UserImageReturnType {
  mediaList: MediaType[]
  mediaIdList: string[]
}
export const getUserImages = async (uuid: string, size: number = 100, token?: string): Promise<UserImageReturnType> => {
  const _t = await getTokenIfNotExist(token)
  const res = await client.post(
    '/files/search',
    {
      query: `(extension:.jpg OR extension:.jpeg OR extension:.png) AND dirname:\\/u\\/${uuid} AND -dirname:\\/.Trash AND -filename:uid.json`,
      sort: {
        ctime: 'desc'
      },
      size
    },
    {
      headers: {
        ...headers,
        Authorization: `bearer ${_t}`
      }
    }
  )
  if (res.status === 200 && Array.isArray(res.data.hits)) {
    const mediaIdList: string[] = []
    const mediaList = res.data.hits.map(entry => {
      const { filename, ctime, mtime, contentType, meta } = entry._source
      const mediaId = mediaUrlHash(filename)
      mediaIdList.push(mediaId)
      return ({
        ownerId: uuid,
        filename,
        mediaId,
        ctime,
        mtime,
        contentType,
        meta
      })
    })

    return {
      mediaList,
      mediaIdList
    }
  }

  throw new Error('Sirv API.getUserImages() error' + res.statusText)
}

export const getImagesByFilenames = async (fileList: string[], token?: string): Promise <any> => {
  if (fileList.length === 0) {
    return {
      mediaList: [],
      idList: []
    }
  }
  const _t = await getTokenIfNotExist(token)

  const _list = fileList.map(file => {
    const name = basename(file)?.trim()
    if (name == null) return null
    return `filename:${name.replace(/\//g, '\\\\//')}`
  })

  const res = await client.post(
    '/files/search',
    {
      query:
        `(${_list.join(' OR ')}) AND -dirname:\\/.Trash`,
      size: 50
    },
    {
      headers: {
        ...headers,
        Authorization: `bearer ${_t}`
      }
    }
  )

  if (res.status === 200 && Array.isArray(res.data.hits)) {
    const mediaIdList: string[] = []
    const mediaList = res.data.hits.map(entry => {
      const { filename, ctime, mtime, contentType, meta } = entry._source
      const mediaId = mediaUrlHash(filename)
      mediaIdList.push(mediaId)
      return ({
        ownerId: '',
        filename,
        mediaId,
        ctime,
        mtime,
        contentType,
        meta: stripMeta(meta)
      })
    })

    return {
      mediaList: mediaList,
      idList: mediaIdList
    }
  }
  throw new Error('Sirv API.searchUserImage() error' + res.statusText)
}

export const getFileInfo = async (uuid: string, filename: string, token?: string): Promise<any> => {
  const _t = await getTokenIfNotExist(token)
  const res = await client.get(
    '/files/stat?filename=' + encodeURIComponent(filename),
    {
      headers: {
        ...headers,
        Authorization: `bearer ${_t}`
      }
    }
  )

  if (res.status === 200) {
    const { ctime, mtime, contentType, meta } = res.data
    const mediaId = mediaUrlHash(filename)
    return ({
      ownerId: uuid,
      filename,
      mediaId,
      ctime,
      mtime,
      contentType,
      meta
    })
  }
  throw new Error('Sirv API.getFileInfo() error' + res.statusText)
}

export const getUserFiles = async (uuid: string, token?: string): Promise<any> => {
  const _t = await getTokenIfNotExist(token)

  const dir = encodeURIComponent(`/u/${uuid}`)
  const res = await client.get(
    '/files/readdir?dirname=' + dir,
    {
      headers: {
        ...headers,
        Authorization: `bearer ${_t}`
      }
    }
  )

  if (res.status === 200) {
    console.log(res.data)
    return null
  }

  throw new Error('Sirv API.getUserFiles() error' + res.statusText)
}

export const createUserDir = async (uuid: string, token?: string): Promise<boolean> => {
  const _t = await getAdminTokenIfNotExist()
  try {
    const res = await client.post(
      `/files/mkdir?dirname=/u/${uuid}`,
      {},
      {
        headers: {
          ...headers,
          Authorization: `bearer ${_t}`
        }
      }
    )

    return res.status === 200
  } catch (e) {
    console.log('Image API createUserDir() failed', e?.response?.status ?? '')
    console.log(e)
    return false
  }
}

/**
 * Upload a photo to Sirv
 * @param filename
 * @param imageData
 * @param token
 * @returns Full path to the photo
 */
export const upload = async (filename: string, imageData: Buffer, token?: string): Promise<string> => {
  const _t = await getAdminTokenIfNotExist(token)

  const res = await client.post(
    `/files/upload?filename=${filename}`,
    imageData,
    {
      headers: {
        'Content-Type': 'image/jpeg',
        Authorization: `bearer ${_t}`
      }
    }
  )
  if (res.status >= 200 && res.status <= 204) {
    return filename
  }
  throw new Error(`Image API upload() failed.  Status: ${res.status}`)
}

/**
 * Delete a photo from Sirv
 * @param filename
 * @param token
 * @returns deleted photo filename
 */
export const remove = async (filename: string, token?: string): Promise<string> => {
  const _t = await getAdminTokenIfNotExist(token)

  const res = await client.post(
    `/files/delete?filename=${filename}`,
    null,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `bearer ${_t}`
      }
    }
  )
  if (res.status >= 200 && res.status <= 204) { return filename }
  throw new Error(`Image API delete() failed.  Status: ${res.status}`)
}

/**
 * A hack to store current username in a json file under their media folder.
 * This way given an image URL, we can load the json file to determine
 * the username without calling Auth0 API.
 * @param filename /u/{uuid}/uid.json file
 * @param uid username to record
 * @param token API RW token
 * @returns true if successful
 */
export const addUserIdFile = async (filename: string, uid: string, token?: string): Promise<boolean> => {
  if (uid == null) return false
  try {
    const _t = await getAdminTokenIfNotExist(token)
    const res = await client.post(
      '/files/upload?filename=' + filename,
      {
        uid: uid.toLowerCase(),
        ts: Date.now()
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `bearer ${_t}`
        }
      }
    )
    if (res.status >= 200 && res.status <= 204) {
      return true
    }
    return false
  } catch (e) {
    // Since this is not a super critical operation,
    // we can swallow the exception
    console.log('Image API create Uid file failed', e)
    return false
  }
}

const stripMeta = ({
  width,
  height,
  format
}): any => ({
  width, height, format
})

export const mediaUrlHash = (mediaUrl: string): string => uuidv5(mediaUrl, uuidv5.URL)
