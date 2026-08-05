# 중만컵 팀 로고

이 폴더에 팀 로고 파일을 넣으면 `/jungman` 지도 마커에 자동으로 표시된다.
파일이 없는 팀은 약칭 텍스트로 폴백하므로, 일부만 넣어도 페이지는 정상 동작한다.

| 파일명 | 팀 |
|---|---|
| `dm.webp` | DM |
| `kms.webp` | 캄몬스타즈 |
| `c9.webp` | 씨나인 |
| `wfu.webp` | 와플대 |
| `jsa.webp` | JSA |
| `bgm.webp` | BGM |
| `hka.webp` | 흑카데미 |
| `hm.webp` | HM |
| `ssg.webp` | 신세계 |
| `ncs.webp` | 뉴캣슬 |
| `mbu.webp` | 엠비대 |
| `ssu.webp` | 수술대 |
| `ku.webp` | 케이대 |

권장: 정사각형, 256×256 이상, 투명 배경 PNG(WebP로 자동 변환해 커밋한다). 파일명은 `lib/jungman.ts`의 `jungmanLogoPath()`가 결정한다.
