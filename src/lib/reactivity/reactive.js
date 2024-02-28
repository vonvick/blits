/*
 * Copyright 2023 Comcast Cable Communications Management, LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { track, trigger } from './effect.js'

const arrayMethods = [
  'constructor',
  'includes',
  'indexOf',
  'lastIndexOf',
  'push',
  'pop',
  'shift',
  'splice',
  'unshift',
  'sort',
  'reverse',
]

const arrayPatchMethods = ['push', 'pop', 'shift', 'unshift', 'splice']

const proxyMap = new WeakMap()

const reactiveProxy = (targetObj, _parent = null, _key) => {
  const isProxy = proxyMap.get(targetObj)
  if (isProxy) {
    return isProxy
  }

  const handler = {
    get(target, key, receiver) {
      if (Array.isArray(target) && arrayMethods.includes(key)) {
        if (arrayPatchMethods.includes(key)) {
          trigger(_parent, _key, true)
        }
        return Reflect.get(target, key, receiver)
      }

      if (target[key] !== null && typeof target[key] === 'object') {
        if (Array.isArray(target[key])) {
          track(target, key)
        }
        return reactiveProxy(target[key], target, key)
      }

      track(target, key)
      return Reflect.get(target, key, receiver)
    },
    set(target, key, value, receiver) {
      const oldValue = targetObj[key]

      let result
      if (typeof value === 'object' && Array.isArray(value) && proxyMap.get(target[key])) {
        if (oldValue !== value) {
          result = oldValue.splice(0, target[key].length, ...value)
        } else {
          result = true
        }
      } else {
        result = Reflect.set(target, key, value, receiver)
      }

      if (typeof value === 'object') {
        reactiveProxy(target[key])
      }

      if (key === 'length' || (result && oldValue !== value)) {
        trigger(target, key)
      }
      return result
    },
  }

  const proxy = new Proxy(targetObj, handler)
  proxyMap.set(targetObj, proxy)
  return proxy
}

const reactiveDefineProperty = (target) => {
  Object.keys(target).forEach((key) => {
    let internalValue = target[key]

    if (target[key] !== null && typeof target[key] === 'object') {
      if (Object.getPrototypeOf(target[key]) === Object.prototype) {
        return reactiveDefineProperty(target[key])
      } else if (Array.isArray(target[key])) {
        for (let i = 0; i < arrayPatchMethods.length - 1; i++) {
          target[key][arrayPatchMethods[i]] = function (v) {
            Array.prototype[arrayPatchMethods[i]].call(this, v)
            trigger(target, key)
          }
        }
      }
    }

    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: true,
      get() {
        track(target, key)
        return internalValue
      },
      set(newValue) {
        // todo: support assigning array (as we do with proxies)
        let oldValue = internalValue
        if (oldValue !== newValue) {
          internalValue = newValue
          trigger(target, key)
        }
      },
    })
  })

  return target
}

export const reactive = (target, mode = 'Proxy') => {
  return mode === 'defineProperty' ? reactiveDefineProperty(target) : reactiveProxy(target)
}

export const memo = (raw) => {
  const r = {
    get value() {
      track(r, 'value')
      return raw
    },
    set value(v) {
      raw = v
      trigger(r, 'value')
    },
  }
  return r
}
